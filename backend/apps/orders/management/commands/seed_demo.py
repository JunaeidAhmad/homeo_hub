"""Optional demo data for manual walkthroughs (DEBUG=True only)."""

import secrets

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.illnesses import services as illnesses
from apps.locations.models import Location
from apps.remedies import services as remedies
from apps.remedies.choices import RemedyForm
from apps.remedies.models import Remedy
from apps.shops import services as shops
from apps.shops.models import ShopRemedy, ShopStaff
from apps.staff import services as staff
from apps.staff.roles import Role


class Command(BaseCommand):
    help = (
        "Seed demo categories, illnesses, remedies with prices, verified shops, and one shop owner."
    )

    def handle(self, *args, **options) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_demo refuses to run when DEBUG is False.")

        staff.seed_roles()
        locs = list(Location.objects.all()[:2])
        if len(locs) < 2:
            raise CommandError("Seed locations first (python manage.py seed_locations).")

        categories_spec = [
            ("Digestive", "পরিপাক", 1),
            ("Respiratory", "শ্বাসতন্ত্র", 2),
            ("Skin & Injury", "ত্বক ও আঘাত", 3),
        ]
        cats = {}
        for name_en, name_bn, order in categories_spec:
            cats[name_en] = illnesses.create_category(
                name_en=name_en, name_bn=name_bn, sort_order=order, is_active=True
            )

        remedies_spec = [
            ("Nux vomica", "নাক্স ভমিকা", "Digestive upset after rich food.", 12000, 15000),
            (
                "Arsenicum album",
                "আর্সেনিকাম অ্যালবাম",
                "Restless burning pain, thirst for sips.",
                13000,
                16000,
            ),
            (
                "Carbo vegetabilis",
                "কার্বো ভেজিটাবিলিস",
                "Bloating and heaviness after meals.",
                11000,
                14000,
            ),
            ("Bryonia alba", "ব্রায়োনিয়া অ্যালবা", "Dry painful cough, worse on movement.", 12500, 15500),
            ("Pulsatilla", "পালসেটিলা", "Loose phlegm, better in fresh open air.", 11500, 14500),
            ("Aconitum napellus", "একোনাইট", "Sudden fever after cold dry wind.", 12000, 15000),
            (
                "Arnica montana",
                "আর্নিকা মন্টানা",
                "Bruising, soreness, and muscle strain.",
                13500,
                17000,
            ),
            (
                "Calendula officinalis",
                "ক্যালেন্ডুলা",
                "Minor cuts and superficial skin abrasions.",
                10000,
                13000,
            ),
        ]
        created_remedies: dict[str, Remedy] = {}
        for name, name_bn, indication, pill_p, liq_p in remedies_spec:
            rem = remedies.create_remedy(
                name=name,
                name_bn=name_bn,
                status=Remedy.Status.ACTIVE,
                description_en=f"Classical homeopathic remedy {name}.",
                indication_en=indication,
                advice_do_en="Take on a clean tongue\nDrink plenty of water",
                advice_dont_en="Avoid coffee or mint near the dose",
            )
            remedies.set_prices(
                rem,
                [
                    {"form": RemedyForm.PILL, "price_poisha": pill_p, "is_active": True},
                    {"form": RemedyForm.LIQUID, "price_poisha": liq_p, "is_active": True},
                ],
            )
            created_remedies[name] = rem

        illness_specs = [
            (
                "Digestive",
                "Acidity",
                "অ্যাসিডিটি",
                "Burning discomfort in upper stomach.",
                ["Nux vomica", "Carbo vegetabilis", "Arsenicum album"],
            ),
            (
                "Digestive",
                "Stomach upset",
                "পেটের পীড়া",
                "Loose stools with weakness or cramping.",
                ["Arsenicum album", "Nux vomica"],
            ),
            (
                "Respiratory",
                "Dry cough",
                "শুকনো কাশি",
                "Dry irritating cough worse with motion.",
                ["Bryonia alba", "Aconitum napellus"],
            ),
            (
                "Respiratory",
                "Cold & catarrh",
                "সর্দি-কাশি",
                "Blocked or runny nose with mild chills.",
                ["Pulsatilla", "Aconitum napellus"],
            ),
            (
                "Skin & Injury",
                "Bruises & sprains",
                "আঘাত ও মোচড়",
                "Soreness and bruising from minor falls.",
                ["Arnica montana"],
            ),
            (
                "Skin & Injury",
                "Minor cuts",
                "ছোট কাটাছেঁড়া",
                "Clean minor scrapes and skin wounds.",
                ["Calendula officinalis", "Arnica montana"],
            ),
        ]
        for cat_name, ill_en, ill_bn, desc, rem_names in illness_specs:
            ill = illnesses.create_illness(
                category=cats[cat_name],
                name_en=ill_en,
                name_bn=ill_bn,
                short_description_en=desc,
                status="ACTIVE",
            )
            illnesses.set_ranked_remedies(ill, [created_remedies[n].id for n in rem_names])

        shop1 = shops.create_shop(
            name="Dhanmondi Homeo Pharmacy",
            location=locs[0],
            address_line="House 14, Satmasjid Road",
            phone="01710000001",
            is_verified=True,
            is_active=True,
        )
        shop2 = shops.create_shop(
            name="Chattogram Dispensary",
            location=locs[1],
            address_line="22 Station Road",
            phone="01710000002",
            is_verified=True,
            is_active=True,
        )
        for rem in created_remedies.values():
            shops.create_listing(
                shop=shop1,
                remedy=rem,
                pack_size=10,
                unit=ShopRemedy.Unit.ML,
                price_poisha=8500,
                stock_qty=25,
            )
            shops.create_listing(
                shop=shop2,
                remedy=rem,
                pack_size=30,
                unit=ShopRemedy.Unit.ML,
                price_poisha=9500,
                stock_qty=15,
            )

        password = secrets.token_urlsafe(12)
        owner = staff.create_staff(
            phone="01710000003",
            full_name="Demo Shop Owner",
            password=password,
            roles=[Role.SHOP_OWNER],
        )
        shops.link_staff(shop1, owner, ShopStaff.Role.OWNER)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded demo data. Shop owner sign-in: phone=01710000003 password={password}"
            )
        )
