"""What staff can be allowed to do, and the roles that bundle those permissions.

A new admin feature adds its permission to ``Perm``, gives it to roles in
``ROLE_PERMISSIONS``, makes a migration, and declares it on the view
(``required_permissions``). ``manage.py seed_roles`` applies the role table.
"""

from enum import StrEnum


class Perm(StrEnum):
    MANAGE_STAFF = "manage_staff"
    VIEW_DOCTORS = "view_doctors"
    MANAGE_DOCTORS = "manage_doctors"
    VIEW_CASES = "view_cases"
    ASSIGN_CASES = "assign_cases"
    MANAGE_REMEDIES = "manage_remedies"
    MANAGE_ILLNESSES = "manage_illnesses"
    VIEW_PATIENTS = "view_patients"
    VIEW_ORDERS = "view_orders"
    MANAGE_ORDERS = "manage_orders"
    VIEW_PAYMENTS = "view_payments"
    MANAGE_PAYMENTS = "manage_payments"
    MANAGE_OWN_SHOP = "manage_own_shop"

    @property
    def full(self) -> str:
        """The name Django's ``has_perm`` expects."""
        return f"staff.{self.value}"


PERMISSION_DESCRIPTIONS: dict[Perm, str] = {
    Perm.MANAGE_STAFF: "Create staff, deactivate them and change their roles",
    Perm.VIEW_DOCTORS: "See doctors and their applications",
    Perm.MANAGE_DOCTORS: "Approve, reject and suspend doctors",
    Perm.VIEW_CASES: "See doctor consultations",
    Perm.ASSIGN_CASES: "Assign consultations to doctors",
    Perm.MANAGE_REMEDIES: "Manage remedies and prices",
    Perm.MANAGE_ILLNESSES: "Manage illnesses and recommendations",
    Perm.VIEW_PATIENTS: "See patient accounts",
    Perm.VIEW_ORDERS: "See orders",
    Perm.MANAGE_ORDERS: "Fulfil orders and record deliveries",
    Perm.VIEW_PAYMENTS: "See payments and invoices",
    Perm.MANAGE_PAYMENTS: "Manage payments and refunds",
    Perm.MANAGE_OWN_SHOP: "Maintain their own shop's price list",
}


class Role(StrEnum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    DOCTOR_MANAGER = "doctor_manager"
    CASE_MANAGER = "case_manager"
    REMEDY_MANAGER = "remedy_manager"
    ILLNESS_MANAGER = "illness_manager"
    FULFILMENT_MANAGER = "fulfilment_manager"
    FINANCE = "finance"
    SUPPORT = "support"
    SHOP_OWNER = "shop_owner"


# docs/01-architecture.md §8.2
ROLE_PERMISSIONS: dict[Role, frozenset[Perm]] = {
    Role.SUPER_ADMIN: frozenset(Perm),
    # Everything except managing staff and their roles; a shop is its owner's.
    Role.ADMIN: frozenset(Perm) - {Perm.MANAGE_STAFF, Perm.MANAGE_OWN_SHOP},
    Role.DOCTOR_MANAGER: frozenset({Perm.VIEW_DOCTORS, Perm.MANAGE_DOCTORS}),
    Role.CASE_MANAGER: frozenset({Perm.VIEW_CASES, Perm.ASSIGN_CASES, Perm.VIEW_DOCTORS}),
    Role.REMEDY_MANAGER: frozenset({Perm.MANAGE_REMEDIES}),
    Role.ILLNESS_MANAGER: frozenset({Perm.MANAGE_ILLNESSES}),
    Role.FULFILMENT_MANAGER: frozenset({Perm.VIEW_ORDERS, Perm.MANAGE_ORDERS}),
    Role.FINANCE: frozenset({Perm.VIEW_PAYMENTS, Perm.MANAGE_PAYMENTS}),
    # Read only, and no clinical notes.
    Role.SUPPORT: frozenset({Perm.VIEW_PATIENTS, Perm.VIEW_ORDERS, Perm.VIEW_CASES}),
    Role.SHOP_OWNER: frozenset({Perm.MANAGE_OWN_SHOP}),
}
