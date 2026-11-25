"""Generate the HomeoHub overview ERD (Graphviz) in the Doctors Hub schema style.

Usage:
    python3 generate_overview_erd.py            # writes .dot, .pdf and .png next to this file
Requires Graphviz (`dot`) on PATH.
"""
import html
import pathlib
import subprocess

FONT = "DejaVu Sans"
HERE = pathlib.Path(__file__).resolve().parent
NAME = "homeohub_overview_erd"

# cluster key -> (label, header colour, cluster fill, border/label colour)
CLUSTERS = {
    "patients":  ("patients",                    "#1f6feb", "#edf3fe", "#1f6feb"),
    "doctors":   ("doctors",                     "#7b4fd6", "#f2edfb", "#7b4fd6"),
    "locations": ("locations",                   "#5d6d7e", "#f0f3f5", "#5d6d7e"),
    "shops":     ("shops",                       "#0f7a5c", "#e7f6f0", "#0f7a5c"),
    "remedies":  ("remedies",                    "#00838f", "#e4f5f6", "#00838f"),
    "illnesses": ("illnesses",                   "#c2510a", "#fdf1e8", "#c2510a"),
    "selfrx":    ("self_prescription",           "#8a6d3b", "#f7f2e8", "#8a6d3b"),
    "consult":   ("doctor_consultancy",          "#c62f3b", "#fdecee", "#c62f3b"),
    "quest":     ("questionnaires",              "#b5367a", "#fbebf4", "#b5367a"),
    "rx":        ("prescriptions",               "#3949ab", "#ebedf8", "#3949ab"),
    "tele":      ("telemedicine",                "#3a6ea5", "#eaf1f8", "#3a6ea5"),
    "billing":   ("billing",                     "#9a7400", "#fbf5e1", "#9a7400"),
    "orders":    ("cart / orders",               "#a0522d", "#fbefe8", "#a0522d"),
    "payments":  ("payments",                    "#2e7d32", "#e9f5ea", "#2e7d32"),
    "rbac":      ("accounts / RBAC (admin, staff, shop owners)", "#455a64", "#eef1f3", "#455a64"),
}

# table -> (cluster, subtitle or None, rows); row = (text, grey hint); "PK ..." rows are bolded
T = {
    "Patient": ("patients", None, [
        ("PK id (UUID)", ""), ("phone", "UQ"), ("password", "hash"), ("full_name", ""),
        ("gender / date_of_birth", ""), ("location_id", "FK"), ("preferred_language", "bn / en"),
        ("status", "enum")]),

    "Doctor": ("doctors", None, [
        ("PK id (UUID)", ""), ("doctor_code", "UQ null"), ("phone / password", ""),
        ("registration_no", "UQ"), ("full_name", ""), ("qualifications / experience", ""),
        ("location_id", "FK"), ("chamber_address", ""), ("consultation_fee", "poisha"),
        ("status", "enum"), ("specialities", "M2M")]),
    "Speciality": ("doctors", None, [("PK id (UUID)", ""), ("name / slug", "")]),

    "Location": ("locations", "area list", [
        ("PK id (UUID)", ""), ("division", ""), ("district", ""), ("upazila_thana", ""),
        ("name", "en / bn"), ("(division, district, upazila)", "UNIQUE")]),

    "Shop": ("shops", None, [
        ("PK id (UUID)", ""), ("name / slug", "UQ"), ("location_id", "FK"),
        ("address_line / phone", ""), ("latitude / longitude", "null"),
        ("is_verified / is_active", "")]),
    "ShopStaff": ("shops", "who manages the shop", [
        ("PK id (UUID)", ""), ("shop_id", "FK"), ("user_id", "FK"), ("role", "owner / staff"),
        ("(shop, user)", "UNIQUE")]),
    "ShopRemedy": ("shops", "shop's own price list, admin-only", [
        ("PK id (UUID)", ""), ("shop_id", "FK"), ("remedy_id", "FK"),
        ("pack_size / unit", ""), ("price", "poisha, shop's price"), ("stock_qty / reserved_qty", ""),
        ("is_available", ""), ("(shop, remedy, pack)", "UNIQUE")]),

    "Remedy": ("remedies", "the medicine only", [
        ("PK id (UUID)", ""), ("name", "UQ, Latin"), ("slug", "UQ"), ("description", "en / bn"),
        ("indication", "en / bn"), ("advice_do / advice_dont", "en / bn"),
        ("status", "enum")]),
    "RemedyPrice": ("remedies", "the only price patients see", [
        ("PK id (UUID)", ""), ("remedy_id", "FK"), ("type", "pill / liquid"),
        ("price", "poisha"), ("is_active", ""), ("(remedy, type)", "UNIQUE")]),

    "IllnessCategory": ("illnesses", None, [("PK id (UUID)", ""), ("name / slug", ""), ("sort_order", "")]),
    "Illness": ("illnesses", None, [
        ("PK id (UUID)", ""), ("category_id", "FK"), ("name", "en / bn"), ("slug", "UQ"),
        ("short_description", ""), ("status", "enum")]),
    "IllnessRemedy": ("illnesses", "links illness to remedies", [
        ("PK id (UUID)", ""), ("illness_id", "FK"), ("remedy_id", "FK"), ("rank", "1 = best"),
        ("(illness, remedy)", "UNIQUE")]),

    "SelfPrescription": ("selfrx", None, [
        ("PK id (UUID)", ""), ("patient_id", "FK"), ("illness_id", "FK"),
        ("location_id", "FK null, for nearby shops"), ("created_at", "")]),
    "SelfPrescriptionItem": ("selfrx", "advice comes from Remedy", [
        ("PK id (UUID)", ""), ("self_prescription_id", "FK"), ("remedy_id", "FK"),
        ("potency", "set by patient"), ("type", "pill / liquid, set by patient")]),

    "DoctorConsultation": ("consult", "the case", [
        ("PK id (UUID)", ""), ("code", "UQ"), ("patient_id", "FK"), ("location_id", "FK, patient's area"),
        ("doctor_id", "FK null"), ("primary / secondary / tertiary_concern", "text"),
        ("status", "enum"), ("parent_id", "self-FK"), ("submitted_at / completed_at", "")]),

    "QuestionSet": ("quest", None, [
        ("PK id (UUID)", ""), ("consultation_id", "FK"), ("doctor_id", "FK"), ("status", "enum"),
        ("sent_at / answered_at", "")]),
    "Question": ("quest", "frozen copy", [
        ("PK id (UUID)", ""), ("question_set_id", "FK"), ("text", "en / bn"),
        ("question_type", "enum"), ("options", "json")]),
    "Answer": ("quest", None, [
        ("PK id (UUID)", ""), ("question_id", "FK UQ"), ("value", "json"), ("file_id", "FK null")]),

    "Prescription": ("rx", "immutable, versioned", [
        ("PK id (UUID)", ""), ("consultation_id", "FK"), ("version", ""), ("previous_id", "self-FK"),
        ("status", "active / superseded"), ("report_after_date", "")]),
    "PrescriptionItem": ("rx", None, [
        ("PK id (UUID)", ""), ("prescription_id", "FK"), ("remedy_id", "FK null"),
        ("potency", "set by doctor"), ("type", "pill / liquid, set by doctor"),
        ("dosage / frequency / duration", "")]),
    "PrescriptionAdvice": ("rx", None, [
        ("PK id (UUID)", ""), ("prescription_id", "FK"), ("kind", "DO / DONT"), ("text", "")]),

    "VideoAppointment": ("tele", None, [
        ("PK id (UUID)", ""), ("consultation_id", "FK"), ("start_at / end_at", ""),
        ("status", "enum"), ("(doctor, time)", "NO OVERLAP")]),
    "CallSession": ("tele", None, [
        ("PK id (UUID)", ""), ("appointment_id", "FK"), ("room_name", "UQ"), ("status", "enum"),
        ("duration_sec", "")]),

    "ConsultationInvoice": ("billing", "unlocks prescription", [
        ("PK id (UUID)", ""), ("consultation_id", "FK"), ("prescription_id", "FK UQ"),
        ("doctor_fee / platform_fee", "poisha"), ("total", "poisha"), ("status", "enum"),
        ("expires_at", "")]),

    "Cart": ("orders", None, [("PK id (UUID)", ""), ("patient_id", "FK"), ("status", "one ACTIVE")]),
    "CartItem": ("orders", "no shop, priced by RemedyPrice", [
        ("PK id (UUID)", ""), ("cart_id", "FK"), ("quantity", "1-10"),
        ("self_prescription_item_id", "FK null"), ("prescription_item_id", "FK null"),
        ("exactly one source item", "CHECK"), ("(cart, source item)", "UNIQUE")]),
    "Order": ("orders", "what the patient sees, one per checkout", [
        ("PK id (UUID)", ""), ("code", "UQ"), ("patient_id", "FK"), ("location_id", "FK, delivery area"),
        ("payment_method", "online / COD"), ("status", "enum"),
        ("subtotal / delivery / total", "poisha"), ("shipping_address", "snapshot")]),
    "ShopAssignment": ("orders", "admin assigns shops, admin-only", [
        ("PK id (UUID)", ""), ("order_id", "FK"), ("shop_id", "FK"),
        ("assigned_by", "FK -> User"), ("status", "enum"), ("shop_total", "poisha"),
        ("(order, shop)", "UNIQUE")]),
    "OrderItem": ("orders", None, [
        ("PK id (UUID)", ""), ("order_id", "FK"),
        ("self_prescription_item_id", "FK null"), ("prescription_item_id", "FK null"),
        ("remedy_name", "snapshot"), ("unit_price / quantity", "patient price snapshot"),
        ("shop_assignment_id", "FK null until assigned"), ("shop_remedy_id", "FK null"),
        ("shop_unit_price", "snapshot null")]),

    "Payment": ("payments", None, [
        ("PK id (UUID)", ""), ("tran_id", "UQ"), ("order_id", "FK null, online"),
        ("shop_assignment_id", "FK null, COD per delivery"), ("invoice_id", "FK null"), ("patient_id", "FK"),
        ("method / gateway", "enum"), ("amount / status", "")]),

    "User": ("rbac", "admin, staff, shop owners", [
        ("PK id (UUID)", ""), ("username", "UQ"), ("full_name / email / phone", ""),
        ("password / totp", ""), ("is_active / is_superuser", ""), ("roles", "M2M -> Role")]),
    "Role": ("rbac", None, [
        ("PK id", ""), ("name", "UQ"), ("description", ""), ("is_system", ""),
        ("permissions", "M2M -> Permission")]),
    "Permission": ("rbac", None, [("PK id", ""), ("codename", "UQ"), ("name", "")]),
}

# (from, to, kind, label, optional)
# kind: "1n" crow at `to`; "n1" crow at `from` (drawn downward); "11" tee at `to`; "m2m" crow both ends
E = [
    ("Doctor", "Speciality", "m2m", "M2M", False),
    ("Location", "Doctor", "1n", "chamber in", False),
    ("Location", "Shop", "1n", "located in", False),
    ("Location", "DoctorConsultation", "1n", "patient picks", False),
    ("Location", "SelfPrescription", "1n", "nearby shops", True),
    ("Location", "Patient", "1n", "lives in", False),

    ("Shop", "ShopRemedy", "1n", "stocks", False),
    ("Remedy", "ShopRemedy", "1n", "sold as", False),
    ("Shop", "ShopStaff", "1n", "", False),
    ("User", "ShopStaff", "1n", "manages", False),

    ("IllnessCategory", "Illness", "1n", "", False),
    ("Illness", "IllnessRemedy", "1n", "ranks", False),
    ("Remedy", "IllnessRemedy", "1n", "", False),

    ("Patient", "SelfPrescription", "1n", "", False),
    ("Illness", "SelfPrescription", "1n", "", False),
    ("SelfPrescription", "SelfPrescriptionItem", "1n", "", False),
    ("Remedy", "SelfPrescriptionItem", "1n", "advice from", False),

    ("Patient", "DoctorConsultation", "1n", "requests", False),
    ("Doctor", "DoctorConsultation", "1n", "handles", True),
    ("DoctorConsultation", "DoctorConsultation", "1n", "follow-up", True),
    ("DoctorConsultation", "QuestionSet", "1n", "asks", False),
    ("QuestionSet", "Question", "1n", "", False),
    ("Question", "Answer", "11", "1-1", False),
    ("DoctorConsultation", "Prescription", "1n", "versions", False),
    ("Prescription", "PrescriptionItem", "1n", "", False),
    ("Prescription", "PrescriptionAdvice", "1n", "", False),
    ("Remedy", "PrescriptionItem", "1n", "prescribed", True),
    ("DoctorConsultation", "VideoAppointment", "1n", "schedules", False),
    ("VideoAppointment", "CallSession", "1n", "", False),
    ("DoctorConsultation", "ConsultationInvoice", "1n", "billed by", False),
    ("Prescription", "ConsultationInvoice", "11", "1-1", False),

    ("Remedy", "RemedyPrice", "1n", "priced as", False),

    ("Patient", "Cart", "1n", "", False),
    ("Cart", "CartItem", "1n", "", False),
    ("Patient", "Order", "1n", "places", False),
    ("Location", "Order", "1n", "delivers to", False),
    ("Order", "OrderItem", "1n", "", False),
    ("Order", "ShopAssignment", "1n", "admin assigns", False),
    ("Shop", "ShopAssignment", "1n", "fulfils", False),
    ("ShopAssignment", "OrderItem", "1n", "fills", True),
    ("ShopRemedy", "OrderItem", "1n", "filled from", True),
    ("SelfPrescriptionItem", "CartItem", "1n", "potency + type", True),
    ("PrescriptionItem", "CartItem", "1n", "potency + type", True),
    ("SelfPrescriptionItem", "OrderItem", "1n", "", True),
    ("PrescriptionItem", "OrderItem", "1n", "", True),

    ("Order", "Payment", "1n", "paid by", True),
    ("ShopAssignment", "Payment", "1n", "COD", True),
    ("ConsultationInvoice", "Payment", "1n", "paid by", True),

    ("User", "Role", "m2m", "M2M", False),
    ("Role", "Permission", "m2m", "M2M", False),
]

# invisible layout hints: stack domains top-to-bottom
HINTS = [
    ("Patient", "Location"), ("User", "Shop"),
    ("Location", "Remedy"), ("Patient", "IllnessCategory"),
    ("IllnessRemedy", "DoctorConsultation"), ("SelfPrescriptionItem", "DoctorConsultation"),
    ("ShopRemedy", "DoctorConsultation"),
]
SAME_RANK = [("Cart", "Order"), ("CartItem", "ShopAssignment")]

GREY = "#8c8c8c"


def esc(s):
    return html.escape(s, quote=True)


def table_label(name, cluster, subtitle, rows):
    _, head, tint, _ = CLUSTERS[cluster]
    out = ['<<TABLE BORDER="1" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4" COLOR="#222222">',
           f'<TR><TD BGCOLOR="{head}" ALIGN="CENTER"><FONT COLOR="white" POINT-SIZE="11"><B>{esc(name)}</B></FONT></TD></TR>']
    if subtitle:
        out.append(f'<TR><TD BGCOLOR="{head}" ALIGN="CENTER"><FONT COLOR="#f2f2f2" POINT-SIZE="7">{esc(subtitle)}</FONT></TD></TR>')
    for i, (text, hint) in enumerate(rows):
        bg = "#f7f7f7" if i % 2 == 0 else tint
        cell = f"<B>PK</B>  {esc(text[3:])}" if text.startswith("PK ") else esc(text)
        if hint:
            cell += f'  <FONT COLOR="{GREY}">{esc(hint)}</FONT>'
        out.append(f'<TR><TD BGCOLOR="{bg}" ALIGN="LEFT" BALIGN="LEFT">{cell}</TD></TR>')
    out.append("</TABLE>>")
    return "".join(out)


def build():
    L = ["digraph HomeoHub {",
         f'  graph [fontname="{FONT}", rankdir=TB, newrank=true, splines=true, nodesep=0.55, ranksep=0.75, pad=0.4, bgcolor="white",',
         '         labelloc="t", label=<<FONT POINT-SIZE="22"><B>HomeoHub — Database Schema (overview)</B></FONT><BR/>'
         f'<FONT POINT-SIZE="11" COLOR="#666666">{len(T)} core tables · patients / doctors / locations / shops / remedies / illnesses / '
         'self-prescription / doctor-consultancy / commerce</FONT><BR/> >];',
         f'  node [shape=plaintext, fontname="{FONT}", fontsize=9];',
         f'  edge [fontname="{FONT}", fontsize=8, color="#5f6b78", penwidth=1.0, arrowsize=0.8];']
    for key, (label, _, fill, border) in CLUSTERS.items():
        L.append(f"  subgraph cluster_{key} {{")
        L.append(f'    label=<<B>{esc(label)}</B>>; fontcolor="{border}"; fontsize=13; style="rounded,filled"; '
                 f'fillcolor="{fill}"; color="{border}"; penwidth=1.2; margin=14;')
        for name, (cl, sub, rows) in T.items():
            if cl == key:
                L.append(f"    {name} [label={table_label(name, cl, sub, rows)}];")
        L.append("  }")
    for a, b, kind, label, optional in E:
        attrs = {"1n": ["dir=forward", "arrowhead=crow"],
                 "n1": ["dir=back", "arrowtail=crow"],
                 "11": ["dir=forward", "arrowhead=tee"],
                 "m2m": ["dir=both", "arrowhead=crow", "arrowtail=crow"]}[kind][:]
        if optional:
            attrs.append("style=dashed")
        if label:
            attrs.append(f'label="{label}"')
        L.append(f"  {a} -> {b} [{', '.join(attrs)}];")
    for a, b in HINTS:
        L.append(f"  {a} -> {b} [style=invis, weight=4];")
    for group in SAME_RANK:
        L.append(f"  {{ rank=same; {'; '.join(group)}; }}")
    L.append("}")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    dot_path = HERE / f"{NAME}.dot"
    dot_path.write_text(build())
    subprocess.run(["dot", "-Tpdf", str(dot_path), "-o", str(HERE / f"{NAME}.pdf")], check=True)
    subprocess.run(["dot", "-Tpng", "-Gdpi=150", str(dot_path), "-o", str(HERE / f"{NAME}.png")], check=True)
    print(f"{len(T)} tables, {len(E)} relationships -> {HERE}")
