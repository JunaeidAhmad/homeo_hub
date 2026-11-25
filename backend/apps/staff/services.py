"""Staff accounts: sign-in, roles, and the rules that stop the admin locking itself out."""

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import Group, Permission, User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ErrorDetail, ValidationError

from apps.accounts import tokens
from apps.accounts.errors import InvalidCredentials
from common.errors import ApiError

from .roles import ROLE_PERMISSIONS, Perm, Role

USER_TYPE = "staff"


class UsernameTaken(ApiError):
    status_code = 409
    error_code = "USERNAME_TAKEN"
    default_detail = "That username is already used."


class CannotLockYourselfOut(ApiError):
    status_code = 409
    error_code = "CANNOT_LOCK_YOURSELF_OUT"
    default_detail = "You cannot deactivate yourself or remove your own super admin role."


class LastSuperAdmin(ApiError):
    status_code = 409
    error_code = "LAST_SUPER_ADMIN"
    default_detail = "There must be at least one active super admin."


class DeveloperAccount(ApiError):
    status_code = 403
    error_code = "DEVELOPER_ACCOUNT"
    default_detail = "This account can only be changed by a developer."


def load_principal(subject_id: str) -> User | None:
    if not subject_id.isdigit():
        return None
    return User.objects.filter(pk=int(subject_id), is_active=True, is_staff=True).first()


def log_in(username: str, password: str) -> tokens.Session:
    user = User.objects.filter(username__iexact=username, is_staff=True).first()
    if user is None:
        make_password(password)  # take as long as for a real account
        raise InvalidCredentials()
    if not user.check_password(password) or not user.is_active:
        raise InvalidCredentials()
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    return tokens.open_session(USER_TYPE, str(user.pk))


def roles_of(user: User) -> list[str]:
    known = set(Role)
    return sorted(group.name for group in user.groups.all() if group.name in known)


def permissions_of(user: User) -> list[str]:
    return sorted(perm.value for perm in Perm if user.has_perm(perm.full))


@transaction.atomic
def seed_roles() -> None:
    """Create the default roles and give each exactly the permissions in ``roles.py``."""
    available = {
        permission.codename: permission
        for permission in Permission.objects.filter(content_type__app_label="staff")
    }
    for role, perms in ROLE_PERMISSIONS.items():
        group, _ = Group.objects.get_or_create(name=role.value)
        group.permissions.set([available[perm.value] for perm in perms])


def _set_roles(user: User, roles: list[str]) -> None:
    groups = list(Group.objects.filter(name__in=roles))
    if len(groups) != len(set(roles)):
        raise ValueError("Roles are missing from the database: run manage.py seed_roles")
    user.groups.set(groups)


def create_staff(*, username: str, full_name: str, password: str, roles: list[str]) -> User:
    user = User(username=username.lower(), first_name=full_name, is_staff=True)
    try:
        validate_password(password, user=user)
    except DjangoValidationError as error:
        problems = [ErrorDetail(e.messages[0], code=e.code) for e in error.error_list]
        raise ValidationError({"password": problems}) from error
    user.set_password(password)
    try:
        with transaction.atomic():
            if User.objects.filter(username__iexact=user.username).exists():
                raise UsernameTaken()
            user.save()
            _set_roles(user, roles)
    except IntegrityError as error:
        raise UsernameTaken() from error
    return user


@transaction.atomic
def update_staff(
    actor: User,
    user: User,
    *,
    full_name: str | None = None,
    roles: list[str] | None = None,
    is_active: bool | None = None,
) -> User:
    if user.is_superuser and not actor.is_superuser:
        raise DeveloperAccount()
    # Changes to who is a super admin take turns, so two cannot remove each other at once.
    Group.objects.select_for_update().filter(name=Role.SUPER_ADMIN).first()
    user = User.objects.select_for_update().get(pk=user.pk)

    was_super = user.is_active and Role.SUPER_ADMIN in roles_of(user)
    stays_active = user.is_active if is_active is None else is_active
    stays_super = was_super and stays_active and (roles is None or Role.SUPER_ADMIN in roles)
    if user.pk == actor.pk and (not stays_active or (was_super and not stays_super)):
        raise CannotLockYourselfOut()
    if was_super and not stays_super:
        others = User.objects.filter(is_active=True, groups__name=Role.SUPER_ADMIN)
        if not others.exclude(pk=user.pk).exists():
            raise LastSuperAdmin()

    if full_name is not None:
        user.first_name = full_name
    user.is_active = stays_active
    user.save(update_fields=["first_name", "is_active"])
    if roles is not None:
        _set_roles(user, roles)
    if not stays_active:
        tokens.close_all_sessions(USER_TYPE, str(user.pk))
    return user
