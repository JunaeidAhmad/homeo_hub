# HomeoHub — ER Diagram

> Version 0.1 · 2026-11-11 · Status: Draft for review
> Tables match [06-data-dictionary.md](06-data-dictionary.md) (full columns, types, defaults and constraints are there).

## How to read this

- §1 is the big picture: the main tables and how they connect, without columns.
- §2–§7 show each area with its keys and main columns. `created_at` / `updated_at` and most `_bn` translation columns are left out to keep the diagrams readable.
- A table shown without columns in an area diagram is drawn in full in another area.
- Crow's-foot notation:

| Symbol | Meaning |
|---|---|
| `\|\|` | exactly one |
| `o\|` / `\|o` | zero or one |
| `}o` / `o{` | zero or many |
| `}\|` / `\|{` | one or many |

---

## 1. Overview

The 16 core tables only. Supporting tables (history, events, templates, settings) are in §2–§7.

```mermaid
erDiagram
    users ||--o| patient_profiles : "is a"
    users ||--o| doctor_profiles : "is a"
    illnesses ||--o{ illness_recommendations : "ranks"
    remedies ||--o{ illness_recommendations : "suggested in"
    remedies ||--|{ remedy_variants : "sold as"
    patient_profiles ||--o{ doctor_consultations : "requests"
    doctor_profiles |o--o{ doctor_consultations : "handles"
    doctor_consultations ||--o{ question_sets : "asks"
    doctor_consultations ||--o{ video_appointments : "schedules"
    doctor_consultations ||--o{ prescriptions : "results in"
    prescriptions ||--|{ prescription_items : "lists"
    remedy_variants |o--o{ prescription_items : "prescribed as"
    doctor_consultations ||--o| consultation_invoices : "billed by"
    patient_profiles ||--o{ orders : "places"
    orders ||--|{ order_items : "contains"
    remedy_variants ||--o{ order_items : "bought as"
    orders |o--o{ payments : "paid by"
    consultation_invoices |o--o{ payments : "paid by"

    users {
        uuid id PK
        varchar user_type "patient, doctor, staff"
        varchar phone
    }
    patient_profiles {
        uuid id PK
        uuid user_id FK
        varchar full_name
    }
    doctor_profiles {
        uuid id PK
        uuid user_id FK
        varchar doctor_code
        varchar status
    }
    illnesses {
        uuid id PK
        varchar name
    }
    illness_recommendations {
        uuid id PK
        uuid illness_id FK
        uuid remedy_id FK
        smallint rank
    }
    remedies {
        uuid id PK
        varchar name
    }
    remedy_variants {
        uuid id PK
        uuid remedy_id FK
        varchar potency
        bigint price
    }
    doctor_consultations {
        uuid id PK
        uuid patient_id FK
        uuid doctor_id FK
        varchar status
    }
    question_sets {
        uuid id PK
        uuid consultation_id FK
    }
    video_appointments {
        uuid id PK
        uuid consultation_id FK
        timestamptz start_at
    }
    prescriptions {
        uuid id PK
        uuid consultation_id FK
        smallint version
    }
    prescription_items {
        uuid id PK
        uuid prescription_id FK
        uuid variant_id FK
        varchar dosage
    }
    consultation_invoices {
        uuid id PK
        uuid consultation_id FK
        bigint total
    }
    orders {
        uuid id PK
        uuid patient_id FK
        varchar payment_method "online or COD"
    }
    order_items {
        uuid id PK
        uuid order_id FK
        uuid variant_id FK
        smallint quantity
    }
    payments {
        uuid id PK
        uuid order_id FK
        uuid invoice_id FK
        varchar status
    }
```

---

## 2. Accounts, patients and doctors

```mermaid
erDiagram
    users {
        uuid id PK
        varchar user_type "PATIENT, DOCTOR, STAFF"
        varchar phone "E.164, unique per user_type"
        varchar username UK "staff only"
        varchar password "Argon2 hash"
        varchar status
        varchar preferred_language "bn or en"
        timestamptz phone_verified_at
        boolean is_superuser
        timestamptz last_login
    }
    auth_group {
        integer id PK
        varchar name UK
    }
    roles {
        integer group_ptr_id PK, FK
        varchar description
        boolean is_system
    }
    auth_permission {
        integer id PK
        integer content_type_id FK
        varchar codename
        varchar name
    }
    auth_group_permissions {
        bigint id PK
        integer group_id FK
        integer permission_id FK
    }
    users_groups {
        bigint id PK
        uuid user_id FK
        integer group_id FK
    }
    staff_profiles {
        uuid id PK
        uuid user_id FK, UK
        varchar full_name
        varchar email UK
        boolean totp_enabled
        boolean must_change_password
    }
    device_tokens {
        uuid id PK
        uuid user_id FK
        varchar platform
        varchar fcm_token UK
        varchar app_version
        timestamptz last_seen_at
        boolean is_active
    }
    patient_profiles {
        uuid id PK
        uuid user_id FK, UK
        varchar full_name
        varchar gender
        date date_of_birth
        boolean dob_is_approximate
        uuid picture_id FK
        smallint completeness_pct
    }
    addresses {
        uuid id PK
        uuid patient_id FK
        varchar label
        varchar recipient_name
        varchar phone
        varchar line1
        varchar upazila_thana
        varchar district
        varchar division
        boolean is_default "one per patient"
    }
    family_history_entries {
        uuid id PK
        uuid patient_id FK
        varchar relation
        varchar condition
        text notes
    }
    medical_history_entries {
        uuid id PK
        uuid patient_id FK
        varchar condition
        date since
        varchar status
        text treatment
    }
    mental_pictures {
        uuid id PK
        uuid patient_id FK, UK
        text temperament
        text fears
        text emotional_state
        text stress_response
        text dreams
    }
    general_pictures {
        uuid id PK
        uuid patient_id FK, UK
        varchar thermal
        text appetite
        text thirst
        text perspiration
        text sleep
        text bowel
    }
    preferences {
        uuid id PK
        uuid patient_id FK
        varchar kind "LIKE, DISLIKE"
        varchar category
        varchar item
    }
    doctor_profiles {
        uuid id PK
        uuid user_id FK, UK
        varchar doctor_code UK "HH-DR-0007"
        varchar full_name
        varchar registration_no UK
        varchar qualifications
        smallint experience_years
        bigint proposed_fee "poisha"
        bigint consultation_fee "poisha"
        varchar status
        boolean is_accepting_cases
        uuid approved_by_id FK
        uuid picture_id FK
    }
    specialities {
        uuid id PK
        varchar name_en
        varchar slug UK
    }
    doctor_specialities {
        bigint id PK
        uuid doctor_id FK
        uuid speciality_id FK
    }
    doctor_documents {
        uuid id PK
        uuid doctor_id FK
        varchar doc_type
        uuid file_id FK
        boolean is_verified
        uuid verified_by_id FK
    }
    doctor_approval_events {
        uuid id PK
        uuid doctor_id FK
        varchar action
        uuid actor_id FK
        text reason
    }
    files

    users ||--o{ users_groups : ""
    auth_group ||--o{ users_groups : ""
    auth_group ||--o| roles : "extended by"
    auth_group ||--o{ auth_group_permissions : ""
    auth_permission ||--o{ auth_group_permissions : ""
    users ||--o| staff_profiles : ""
    users ||--o{ device_tokens : ""
    users ||--o| patient_profiles : ""
    users ||--o| doctor_profiles : ""
    patient_profiles ||--o{ addresses : ""
    patient_profiles ||--o{ family_history_entries : ""
    patient_profiles ||--o{ medical_history_entries : ""
    patient_profiles ||--o| mental_pictures : ""
    patient_profiles ||--o| general_pictures : ""
    patient_profiles ||--o{ preferences : ""
    patient_profiles }o--o| files : "picture"
    doctor_profiles ||--o{ doctor_specialities : ""
    specialities ||--o{ doctor_specialities : ""
    doctor_profiles ||--o{ doctor_documents : ""
    doctor_documents }o--|| files : ""
    doctor_profiles ||--o{ doctor_approval_events : ""
    users ||--o{ doctor_approval_events : "actor"
```

---

## 3. Remedies, illnesses and self-consultancy

```mermaid
erDiagram
    remedies {
        uuid id PK
        varchar name UK "Latin name"
        varchar common_name_en
        varchar slug UK
        varchar short_description_en
        text description_en
        varchar status
        tsvector search_vector
    }
    remedy_variants {
        uuid id PK
        uuid remedy_id FK
        varchar sku UK
        varchar potency "6C, 30C, 200C, 1M"
        varchar form
        numeric pack_size
        varchar unit
        bigint price "poisha"
        integer stock_qty
        integer reserved_qty
        varchar status
    }
    remedy_images {
        uuid id PK
        uuid remedy_id FK
        uuid file_id FK
        smallint sort_order
        boolean is_primary
    }
    illness_categories {
        uuid id PK
        varchar name_en
        varchar slug UK
        smallint sort_order
    }
    illnesses {
        uuid id PK
        uuid category_id FK
        varchar name_en
        varchar name_bn
        varchar slug UK
        varchar short_description_en
        varchar status
        tsvector search_vector
    }
    illness_recommendations {
        uuid id PK
        uuid illness_id FK
        uuid remedy_id FK
        smallint rank "1 = most likely"
        smallint match_score "0 to 100"
        varchar indication_en
        varchar indication_bn
        uuid suggested_variant_id FK
    }
    self_consultations {
        uuid id PK
        uuid patient_id FK
        uuid illness_id FK
        timestamptz started_at
        uuid converted_order_id FK
    }
    patient_profiles
    orders
    files

    remedies ||--|{ remedy_variants : ""
    remedies ||--o{ remedy_images : ""
    remedy_images }o--|| files : ""
    illness_categories ||--o{ illnesses : ""
    illnesses ||--o{ illness_recommendations : ""
    remedies ||--o{ illness_recommendations : ""
    remedy_variants |o--o{ illness_recommendations : "suggested"
    patient_profiles ||--o{ self_consultations : ""
    illnesses ||--o{ self_consultations : ""
    orders |o--o{ self_consultations : "converted to"
```

---

## 4. Doctor-consultancy and questionnaires

```mermaid
erDiagram
    doctor_consultations {
        uuid id PK
        varchar code UK "HH-C-000123"
        uuid patient_id FK
        uuid doctor_id FK "null until assigned"
        uuid assigned_by_id FK
        timestamptz assigned_at
        varchar status
        uuid parent_id FK "follow-up of"
        timestamptz submitted_at
        timestamptz completed_at
        timestamptz closed_at
        text withdraw_reason
        text cancel_reason
    }
    concern_categories {
        uuid id PK
        varchar name_en
        varchar slug UK
    }
    consultation_concerns {
        uuid id PK
        uuid consultation_id FK
        varchar level "PRIMARY, SECONDARY, TERTIARY"
        uuid category_id FK
        text description
        varchar duration_text
        smallint severity
    }
    consultation_attachments {
        uuid id PK
        uuid consultation_id FK
        uuid file_id FK
        varchar caption
        uuid uploaded_by_id FK
    }
    consultation_status_history {
        uuid id PK
        uuid consultation_id FK
        varchar from_status
        varchar to_status
        uuid actor_id FK
        text reason
    }
    doctor_notes {
        uuid id PK
        uuid consultation_id FK
        uuid doctor_id FK
        text body
    }
    question_templates {
        uuid id PK
        varchar text_en
        varchar text_bn
        varchar question_type
        jsonb options
        boolean is_required
        varchar status
    }
    question_template_categories {
        bigint id PK
        uuid template_id FK
        uuid category_id FK
    }
    question_template_sets {
        uuid id PK
        varchar name_en
        varchar status
    }
    question_template_set_items {
        bigint id PK
        uuid set_id FK
        uuid template_id FK
        smallint sort_order
    }
    question_template_set_categories {
        bigint id PK
        uuid set_id FK
        uuid category_id FK
    }
    question_sets {
        uuid id PK
        uuid consultation_id FK
        uuid doctor_id FK
        text message
        varchar status
        timestamptz sent_at
        timestamptz answered_at
    }
    questions {
        uuid id PK
        uuid question_set_id FK
        uuid template_id FK "null if custom"
        varchar text_en
        varchar text_bn
        varchar question_type
        jsonb options
        boolean is_required
        smallint sort_order
    }
    answers {
        uuid id PK
        uuid question_id FK, UK
        jsonb value
        uuid file_id FK
        timestamptz answered_at
    }
    patient_profiles
    doctor_profiles
    files

    patient_profiles ||--o{ doctor_consultations : ""
    doctor_profiles |o--o{ doctor_consultations : ""
    doctor_consultations |o--o{ doctor_consultations : "follow-up"
    doctor_consultations ||--|{ consultation_concerns : ""
    concern_categories ||--o{ consultation_concerns : ""
    doctor_consultations ||--o{ consultation_attachments : ""
    consultation_attachments }o--|| files : ""
    doctor_consultations ||--o{ consultation_status_history : ""
    doctor_consultations ||--o{ doctor_notes : ""
    doctor_consultations ||--o{ question_sets : ""
    question_sets ||--|{ questions : ""
    questions ||--o| answers : ""
    question_templates |o--o{ questions : "copied from"
    question_templates ||--o{ question_template_categories : ""
    concern_categories ||--o{ question_template_categories : ""
    question_template_sets ||--o{ question_template_set_items : ""
    question_templates ||--o{ question_template_set_items : ""
    question_template_sets ||--o{ question_template_set_categories : ""
    concern_categories ||--o{ question_template_set_categories : ""
```

---

## 5. Prescriptions, video appointments and billing

```mermaid
erDiagram
    prescriptions {
        uuid id PK
        uuid consultation_id FK
        uuid doctor_id FK
        uuid patient_id FK
        smallint version
        uuid previous_id FK, UK
        varchar status "ACTIVE, SUPERSEDED"
        timestamptz issued_at
        date report_after_date
        text general_instructions
    }
    prescription_items {
        uuid id PK
        uuid prescription_id FK
        uuid remedy_id FK "null if not listed"
        uuid variant_id FK "set means purchasable"
        varchar remedy_name
        varchar potency
        varchar dosage
        varchar frequency
        varchar duration
        smallint sort_order
    }
    prescription_advice {
        uuid id PK
        uuid prescription_id FK
        varchar kind "DO, DONT"
        varchar text
        smallint sort_order
    }
    video_appointments {
        uuid id PK
        uuid consultation_id FK
        uuid doctor_id FK
        uuid patient_id FK
        timestamptz start_at
        smallint duration_min
        timestamptz end_at
        varchar status
        uuid created_by_id FK
    }
    appointment_events {
        uuid id PK
        uuid appointment_id FK
        uuid actor_id FK
        varchar action
        timestamptz proposed_start_at
        jsonb preferred_times
        text note
    }
    call_sessions {
        uuid id PK
        uuid appointment_id FK
        varchar room_name UK
        varchar status
        timestamptz started_at
        timestamptz answered_at
        timestamptz ended_at
        integer duration_sec
        uuid ended_by_id FK
    }
    consultation_invoices {
        uuid id PK
        varchar code UK
        uuid consultation_id FK
        uuid prescription_id FK, UK
        bigint doctor_fee
        bigint platform_fee
        varchar platform_fee_type
        integer platform_fee_value
        bigint total
        varchar status
        timestamptz expires_at
        timestamptz paid_at
        uuid waived_by_id FK
    }
    doctor_consultations
    doctor_profiles
    patient_profiles
    remedies
    remedy_variants
    payments

    doctor_consultations ||--o{ prescriptions : "versions"
    prescriptions |o--o| prescriptions : "previous"
    doctor_profiles ||--o{ prescriptions : "writes"
    patient_profiles ||--o{ prescriptions : "receives"
    prescriptions ||--|{ prescription_items : ""
    prescriptions ||--o{ prescription_advice : ""
    remedies |o--o{ prescription_items : ""
    remedy_variants |o--o{ prescription_items : ""
    doctor_consultations ||--o{ video_appointments : ""
    doctor_profiles ||--o{ video_appointments : ""
    patient_profiles ||--o{ video_appointments : ""
    video_appointments ||--|{ appointment_events : ""
    video_appointments ||--o{ call_sessions : ""
    doctor_consultations ||--o{ consultation_invoices : ""
    prescriptions ||--o| consultation_invoices : "unlocked by"
    consultation_invoices |o--o{ payments : ""
```

---

## 6. Cart, orders and payments

```mermaid
erDiagram
    carts {
        uuid id PK
        uuid patient_id FK
        varchar status "one ACTIVE per patient"
    }
    cart_items {
        uuid id PK
        uuid cart_id FK
        uuid variant_id FK
        smallint quantity
        varchar source "SELF_CONSULT, PRESCRIPTION, FINDER"
        uuid source_id
    }
    orders {
        uuid id PK
        varchar code UK "HH-ORD-000123"
        uuid patient_id FK
        varchar status
        varchar payment_method "ONLINE, COD"
        bigint subtotal
        bigint delivery_charge
        bigint discount
        bigint total
        jsonb shipping_address "snapshot"
        uuid delivery_rule_id FK
        varchar courier_name
        varchar tracking_no
        timestamptz placed_at
        timestamptz paid_at
        timestamptz delivered_at
    }
    order_items {
        uuid id PK
        uuid order_id FK
        uuid variant_id FK
        varchar remedy_name "snapshot"
        varchar potency "snapshot"
        bigint unit_price "snapshot"
        smallint quantity
        bigint line_total
        varchar source
        uuid source_id
    }
    order_status_history {
        uuid id PK
        uuid order_id FK
        varchar from_status
        varchar to_status
        uuid actor_id FK
        text note
    }
    stock_movements {
        uuid id PK
        uuid variant_id FK
        uuid order_id FK
        varchar movement_type
        integer quantity
        uuid actor_id FK
    }
    delivery_rules {
        uuid id PK
        varchar name
        jsonb districts
        bigint min_subtotal
        bigint charge
        bigint free_above
        boolean cod_allowed
        bigint cod_max_amount
        smallint priority
        boolean is_active
    }
    payments {
        uuid id PK
        varchar tran_id UK
        varchar payable_type "ORDER or INVOICE"
        uuid order_id FK
        uuid invoice_id FK
        uuid patient_id FK
        varchar method
        varchar gateway
        bigint amount
        varchar status
        varchar val_id UK
        varchar client
        varchar api_version
        varchar callback_base_url
        bigint refunded_amount
        uuid collected_by_id FK "COD"
    }
    payment_events {
        uuid id PK
        uuid payment_id FK
        varchar tran_id
        varchar kind
        jsonb payload
        boolean is_valid
        timestamptz received_at
    }
    refunds {
        uuid id PK
        uuid payment_id FK
        bigint amount
        text reason
        varchar status
        varchar gateway_ref
        uuid requested_by_id FK
    }
    patient_profiles
    remedy_variants
    consultation_invoices

    patient_profiles ||--o{ carts : ""
    carts ||--o{ cart_items : ""
    remedy_variants ||--o{ cart_items : ""
    patient_profiles ||--o{ orders : ""
    orders ||--|{ order_items : ""
    remedy_variants ||--o{ order_items : ""
    orders ||--o{ order_status_history : ""
    delivery_rules |o--o{ orders : "charged by"
    remedy_variants ||--o{ stock_movements : ""
    orders |o--o{ stock_movements : ""
    orders |o--o{ payments : ""
    consultation_invoices |o--o{ payments : ""
    patient_profiles ||--o{ payments : "pays"
    payments |o--o{ payment_events : ""
    payments ||--o{ refunds : ""
```

A payment row has **either** `order_id` **or** `invoice_id` (check constraint on `payable_type`).

---

## 7. Notifications, media and platform

```mermaid
erDiagram
    notifications {
        uuid id PK
        uuid user_id FK
        varchar event_type
        varchar title
        text body
        varchar deep_link
        jsonb data
        timestamptz read_at
    }
    notification_templates {
        uuid id PK
        varchar event_type
        varchar channel
        varchar language
        varchar title
        text body
        boolean is_active
    }
    notification_deliveries {
        uuid id PK
        uuid notification_id FK
        varchar channel
        varchar status
        varchar provider_ref
        timestamptz sent_at
    }
    files {
        uuid id PK
        uuid owner_id FK
        varchar purpose
        varchar storage_key UK
        varchar mime_type
        bigint size_bytes
        varchar status
        boolean is_private
    }
    settings {
        varchar key PK
        jsonb value
        uuid updated_by_id FK
    }
    audit_logs {
        uuid id PK
        uuid actor_id FK
        varchar action
        varchar target_type
        varchar target_id
        inet ip
        jsonb changes
    }
    app_version_policies {
        uuid id PK
        varchar platform UK
        varchar min_version
        varchar latest_version
        varchar store_url
    }
    users

    users ||--o{ notifications : "receives"
    notifications ||--o{ notification_deliveries : ""
    users |o--o{ files : "owns"
    users |o--o{ settings : "last updated"
    users |o--o{ audit_logs : "actor"
```

`notification_templates` and `app_version_policies` stand alone: templates are matched by `event_type` + `channel` + `language`, not by a foreign key.
