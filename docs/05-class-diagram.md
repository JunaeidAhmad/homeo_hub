# HomeoHub — Class Diagram

> Version 0.1 · 2026-11-11 · Status: Draft for review
> Built from [04-domain-objects.md](04-domain-objects.md). Column types, nullability and constraints are in [06-data-dictionary.md](06-data-dictionary.md); tables and keys in [07-er-diagram.md](07-er-diagram.md).

## How to read this

- One diagram per area. A class shown with only a stereotype such as `<<patients>>` lives in another module and is drawn in full in that module's diagram.
- `id`, `created_at` and `updated_at` exist on every entity and are left out.
- Types are domain types: `Money` (integer poisha + currency), `LocalizedText` (`_en` / `_bn` pair), `PhoneNumber`, enums from §8.
- **Django mapping:** each entity is a `models.Model` in the module's Django app. Methods on the model are small rules about its own state (e.g. `Order.ship()` checks the transition is allowed). Work that touches several objects (checkout, payment processing, assigning a doctor) lives in the service classes of §7.

| Arrow | Meaning |
|---|---|
| `*--` | Composition — the part cannot exist without the whole (deleted with it) |
| `o--` | Aggregation — the part is linked but lives on its own |
| `-->` | Association — one object refers to another |
| `..>` | Dependency — uses, does not store |
| `..\|>` | Implements an interface |

---

## 1. accounts, patients, doctors

```mermaid
classDiagram
    class User {
        +UserType user_type
        +PhoneNumber phone
        +str username
        +str password
        +UserStatus status
        +Language preferred_language
        +datetime phone_verified_at
        +datetime last_login
        +set_password(raw str) None
        +check_password(raw str) bool
        +verify_phone() None
        +block(reason str) None
        +unblock() None
        +has_perm(codename str) bool
    }
    class Role {
        +str name
        +str description
        +bool is_system
    }
    class Permission {
        +str codename
        +str name
    }
    class StaffProfile {
        +str full_name
        +str email
        +bool totp_enabled
        +bool must_change_password
    }
    class DeviceToken {
        +ClientPlatform platform
        +str fcm_token
        +str app_version
        +datetime last_seen_at
        +bool is_active
        +deactivate() None
    }
    class PatientProfile {
        +str full_name
        +Gender gender
        +date date_of_birth
        +bool dob_is_approximate
        +int completeness_pct
        +age() int
        +default_address() Address
        +recalculate_completeness() int
    }
    class Address {
        +str label
        +str recipient_name
        +PhoneNumber phone
        +str line1
        +str area
        +str upazila_thana
        +str district
        +str division
        +str postcode
        +bool is_default
        +make_default() None
        +snapshot() AddressSnapshot
    }
    class FamilyHistoryEntry {
        +FamilyRelation relation
        +str condition
        +str notes
    }
    class MedicalHistoryEntry {
        +str condition
        +date since
        +HistoryStatus status
        +str treatment
        +str notes
    }
    class MentalPicture {
        +str temperament
        +str fears
        +str emotional_state
        +str stress_response
        +str dreams
        +str notes
    }
    class GeneralPicture {
        +Thermal thermal
        +str appetite
        +str thirst
        +str perspiration
        +str sleep
        +str bowel
        +str energy
        +str notes
    }
    class Preference {
        +PreferenceKind kind
        +PreferenceCategory category
        +str item
    }
    class DoctorProfile {
        +str doctor_code
        +str full_name
        +Gender gender
        +str registration_no
        +str qualifications
        +int experience_years
        +LocalizedText bio
        +Money proposed_fee
        +Money consultation_fee
        +DoctorStatus status
        +bool is_accepting_cases
        +datetime approved_at
        +str rejection_reason
        +approve(by User, fee Money) None
        +reject(by User, reason str) None
        +resubmit() None
        +suspend(by User, reason str) None
        +reactivate(by User) None
        +is_approved() bool
        +open_case_count() int
    }
    class Speciality {
        +LocalizedText name
        +str slug
        +bool is_active
    }
    class DoctorDocument {
        +DocumentType doc_type
        +bool is_verified
        +datetime verified_at
        +verify(by User) None
    }
    class DoctorApprovalEvent {
        +ApprovalAction action
        +str reason
    }
    class FileObject {
        <<media>>
    }

    User "*" -- "*" Role : member of
    Role "*" -- "*" Permission : grants
    User "1" -- "0..1" PatientProfile : is patient
    User "1" -- "0..1" DoctorProfile : is doctor
    User "1" -- "0..1" StaffProfile : is staff
    User "1" *-- "*" DeviceToken : push to
    PatientProfile "1" *-- "*" Address
    PatientProfile "1" *-- "*" FamilyHistoryEntry
    PatientProfile "1" *-- "*" MedicalHistoryEntry
    PatientProfile "1" *-- "0..1" MentalPicture
    PatientProfile "1" *-- "0..1" GeneralPicture
    PatientProfile "1" *-- "*" Preference
    PatientProfile --> "0..1" FileObject : picture
    DoctorProfile "*" o-- "*" Speciality
    DoctorProfile "1" *-- "*" DoctorDocument
    DoctorProfile "1" *-- "*" DoctorApprovalEvent
    DoctorDocument --> "1" FileObject : file
    DoctorApprovalEvent --> "1" User : actor
```

---

## 2. remedies, illnesses, self_consultation

```mermaid
classDiagram
    class Remedy {
        +str name
        +LocalizedText common_name
        +str slug
        +LocalizedText short_description
        +LocalizedText description
        +PublishStatus status
        +publish() None
        +unpublish() None
        +is_available() bool
        +primary_image() RemedyImage
        +active_variants() List~RemedyVariant~
    }
    class RemedyVariant {
        +str sku
        +str potency
        +RemedyForm form
        +decimal pack_size
        +PackUnit unit
        +Money price
        +int stock_qty
        +int reserved_qty
        +PublishStatus status
        +available_qty() int
        +reserve(qty int) None
        +release(qty int) None
        +commit(qty int) None
        +restock(qty int) None
        +label() str
    }
    class RemedyImage {
        +str alt_text
        +int sort_order
        +bool is_primary
    }
    class IllnessCategory {
        +LocalizedText name
        +str slug
        +int sort_order
        +bool is_active
    }
    class Illness {
        +LocalizedText name
        +str slug
        +LocalizedText short_description
        +PublishStatus status
        +publish() None
        +unpublish() None
        +ranked_recommendations() List~IllnessRecommendation~
    }
    class IllnessRecommendation {
        +int rank
        +int match_score
        +LocalizedText indication
        +move_to(rank int) None
    }
    class SelfConsultation {
        +datetime started_at
        +mark_converted(order Order) None
    }
    class PatientProfile {
        <<patients>>
    }
    class Order {
        <<orders>>
    }
    class FileObject {
        <<media>>
    }

    Remedy "1" *-- "1..*" RemedyVariant : sold as
    Remedy "1" *-- "*" RemedyImage
    RemedyImage --> "1" FileObject : file
    IllnessCategory "1" o-- "*" Illness
    Illness "1" *-- "*" IllnessRecommendation : ranked remedies
    IllnessRecommendation --> "1" Remedy : recommends
    IllnessRecommendation --> "0..1" RemedyVariant : suggested variant
    PatientProfile "1" --> "*" SelfConsultation : started
    SelfConsultation --> "1" Illness : about
    SelfConsultation --> "0..1" Order : converted to
```

---

## 3. doctor_consultancy, questionnaires, prescriptions, telemedicine, billing

```mermaid
classDiagram
    class DoctorConsultation {
        +str code
        +ConsultationStatus status
        +datetime submitted_at
        +datetime assigned_at
        +datetime completed_at
        +datetime closed_at
        +str withdraw_reason
        +str cancel_reason
        +assign(doctor DoctorProfile, by User) None
        +reassign(doctor DoctorProfile, by User) None
        +open_by_doctor() None
        +await_patient() None
        +resume_review() None
        +mark_prescribed() None
        +complete() None
        +withdraw(reason str) None
        +cancel(by User, reason str) None
        +close_unpaid() None
        +is_open() bool
        +primary_concern() ConsultationConcern
    }
    class ConcernCategory {
        +LocalizedText name
        +str slug
        +int sort_order
        +bool is_active
    }
    class ConsultationConcern {
        +ConcernLevel level
        +str description
        +str duration_text
        +int severity
    }
    class ConsultationAttachment {
        +str caption
    }
    class ConsultationStatusHistory {
        +ConsultationStatus from_status
        +ConsultationStatus to_status
        +str reason
    }
    class DoctorNote {
        +str body
    }
    class QuestionTemplate {
        +LocalizedText text
        +QuestionType question_type
        +json options
        +bool is_required
        +PublishStatus status
    }
    class QuestionTemplateSet {
        +LocalizedText name
        +str description
        +PublishStatus status
        +ordered_templates() List~QuestionTemplate~
    }
    class QuestionSet {
        +str message
        +QuestionSetStatus status
        +datetime sent_at
        +datetime answered_at
        +submit_answers(answers List~Answer~) None
        +cancel() None
        +is_complete() bool
    }
    class Question {
        +LocalizedText text
        +QuestionType question_type
        +json options
        +bool is_required
        +int sort_order
        +validate(value json) bool
    }
    class Answer {
        +json value
        +datetime answered_at
    }
    class Prescription {
        +int version
        +PrescriptionStatus status
        +datetime issued_at
        +date report_after_date
        +str general_instructions
        +revise(by DoctorProfile) Prescription
        +supersede() None
        +purchasable_items() List~PrescriptionItem~
        +is_visible_to_patient() bool
    }
    class PrescriptionItem {
        +str remedy_name
        +str potency
        +str dosage
        +str frequency
        +str duration
        +str instructions
        +int sort_order
        +is_purchasable() bool
    }
    class PrescriptionAdvice {
        +AdviceKind kind
        +str text
        +int sort_order
    }
    class VideoAppointment {
        +datetime start_at
        +datetime end_at
        +int duration_min
        +AppointmentStatus status
        +propose(slot TimeSlot) None
        +accept() None
        +reject(note str) None
        +request_reschedule(note str, preferred List~TimeSlot~) None
        +cancel(by User, note str) None
        +start() CallSession
        +complete() None
        +mark_no_show() None
        +expire() None
        +can_start_now() bool
    }
    class AppointmentEvent {
        +AppointmentAction action
        +datetime proposed_start_at
        +json preferred_times
        +str note
    }
    class CallSession {
        +str room_name
        +CallStatus status
        +datetime started_at
        +datetime answered_at
        +datetime ended_at
        +int duration_sec
        +join() None
        +end(by User) None
        +mark_missed() None
    }
    class ConsultationInvoice {
        +str code
        +Money doctor_fee
        +Money platform_fee
        +PlatformFeeType platform_fee_type
        +int platform_fee_value
        +Money total
        +InvoiceStatus status
        +datetime issued_at
        +datetime paid_at
        +datetime expires_at
        +str waive_reason
        +mark_paid(payment Payment) None
        +waive(by User, reason str) None
        +void() None
        +expire() None
        +unlocks_prescription() bool
    }
    class PatientProfile {
        <<patients>>
    }
    class DoctorProfile {
        <<doctors>>
    }
    class Remedy {
        <<remedies>>
    }
    class RemedyVariant {
        <<remedies>>
    }
    class Payment {
        <<payments>>
    }

    PatientProfile "1" --> "*" DoctorConsultation : submits
    DoctorProfile "0..1" --> "*" DoctorConsultation : assigned
    DoctorConsultation --> "0..1" DoctorConsultation : follow-up of
    DoctorConsultation "1" *-- "1..3" ConsultationConcern
    ConsultationConcern --> "1" ConcernCategory
    DoctorConsultation "1" *-- "*" ConsultationAttachment
    DoctorConsultation "1" *-- "*" ConsultationStatusHistory
    DoctorConsultation "1" *-- "*" DoctorNote
    DoctorConsultation "1" *-- "*" QuestionSet
    QuestionSet "1" *-- "1..*" Question
    Question "1" *-- "0..1" Answer
    Question --> "0..1" QuestionTemplate : copied from
    QuestionTemplate "*" --> "*" ConcernCategory : tagged
    QuestionTemplateSet "*" o-- "*" QuestionTemplate : contains
    QuestionTemplateSet "*" --> "*" ConcernCategory : tagged
    DoctorConsultation "1" *-- "*" Prescription : versions
    Prescription --> "0..1" Prescription : previous version
    Prescription "1" *-- "1..*" PrescriptionItem
    Prescription "1" *-- "*" PrescriptionAdvice
    PrescriptionItem --> "0..1" Remedy
    PrescriptionItem --> "0..1" RemedyVariant
    DoctorConsultation "1" *-- "*" VideoAppointment
    VideoAppointment "1" *-- "1..*" AppointmentEvent
    VideoAppointment "1" *-- "*" CallSession
    DoctorConsultation "1" *-- "0..1" ConsultationInvoice : active invoice
    ConsultationInvoice --> "1" Prescription : unlocks
    ConsultationInvoice "1" --> "*" Payment : paid by
```

---

## 4. cart, orders, payments

```mermaid
classDiagram
    class Cart {
        +CartStatus status
        +add(variant RemedyVariant, qty int, source CartItemSource, source_id UUID) CartItem
        +add_prescription(rx Prescription) List~CartItem~
        +update_quantity(item CartItem, qty int) None
        +remove(item CartItem) None
        +subtotal() Money
        +convert() None
    }
    class CartItem {
        +int quantity
        +CartItemSource source
        +UUID source_id
        +line_total() Money
    }
    class Order {
        +str code
        +OrderStatus status
        +PaymentMethod payment_method
        +Money subtotal
        +Money delivery_charge
        +Money discount
        +Money total
        +AddressSnapshot shipping_address
        +str courier_name
        +str tracking_no
        +datetime placed_at
        +datetime paid_at
        +datetime delivered_at
        +datetime cancelled_at
        +str cancel_reason
        +mark_paid(payment Payment) None
        +start_processing(by User) None
        +ship(by User, courier str, tracking str) None
        +deliver(by User, cod_collected Money) None
        +mark_returned(by User) None
        +cancel(by User, reason str) None
        +mark_refunded() None
        +can_patient_cancel() bool
    }
    class OrderItem {
        +str remedy_name
        +str potency
        +RemedyForm form
        +decimal pack_size
        +PackUnit unit
        +Money unit_price
        +int quantity
        +Money line_total
        +CartItemSource source
        +UUID source_id
    }
    class OrderStatusHistory {
        +OrderStatus from_status
        +OrderStatus to_status
        +str note
    }
    class StockMovement {
        +StockMovementType movement_type
        +int quantity
        +str note
    }
    class DeliveryRule {
        +str name
        +List~str~ districts
        +Money min_subtotal
        +Money charge
        +Money free_above
        +bool cod_allowed
        +Money cod_max_amount
        +int priority
        +bool is_active
        +applies_to(district str, subtotal Money) bool
        +quote(subtotal Money) DeliveryQuote
    }
    class Payment {
        +str tran_id
        +PayableType payable_type
        +PaymentMethod method
        +PaymentGatewayCode gateway
        +Money amount
        +PaymentStatus status
        +str session_key
        +str val_id
        +str bank_tran_id
        +str card_type
        +ClientPlatform client
        +str api_version
        +str callback_base_url
        +datetime initiated_at
        +datetime completed_at
        +Money refunded_amount
        +mark_pending(session GatewaySession) None
        +mark_success(result ValidationResult) None
        +mark_failed(reason str) None
        +mark_cancelled() None
        +expire() None
        +refundable_amount() Money
    }
    class PaymentEvent {
        +str tran_id
        +PaymentEventKind kind
        +json payload
        +bool is_valid
        +datetime received_at
    }
    class Refund {
        +Money amount
        +str reason
        +RefundStatus status
        +str gateway_ref
        +datetime completed_at
    }
    class PatientProfile {
        <<patients>>
    }
    class RemedyVariant {
        <<remedies>>
    }
    class ConsultationInvoice {
        <<billing>>
    }

    PatientProfile "1" --> "*" Cart
    Cart "1" *-- "*" CartItem
    CartItem --> "1" RemedyVariant
    PatientProfile "1" --> "*" Order : places
    Order "1" *-- "1..*" OrderItem
    OrderItem --> "1" RemedyVariant
    Order "1" *-- "*" OrderStatusHistory
    Order --> "0..1" DeliveryRule : charged by
    StockMovement --> "1" RemedyVariant
    StockMovement --> "0..1" Order
    Order "1" --> "*" Payment : paid by
    ConsultationInvoice "1" --> "*" Payment : paid by
    PatientProfile "1" --> "*" Payment
    Payment "1" *-- "*" PaymentEvent
    Payment "1" *-- "*" Refund
```

`Payment` belongs to **either** an `Order` **or** a `ConsultationInvoice`, never both (`payable_type` says which).

---

## 5. notifications, media, platform

```mermaid
classDiagram
    class Notification {
        +str event_type
        +str title
        +str body
        +str deep_link
        +json data
        +datetime read_at
        +mark_read() None
    }
    class NotificationTemplate {
        +str event_type
        +NotificationChannel channel
        +Language language
        +str title
        +str body
        +bool is_active
        +render(context dict) str
    }
    class NotificationDelivery {
        +NotificationChannel channel
        +DeliveryStatus status
        +str provider_ref
        +str error
        +datetime sent_at
    }
    class FileObject {
        +FilePurpose purpose
        +str storage_key
        +str original_name
        +str mime_type
        +int size_bytes
        +str checksum_sha256
        +FileStatus status
        +bool is_private
        +signed_url(ttl_seconds int) str
        +mark_ready() None
        +reject(reason str) None
    }
    class Setting {
        +str key
        +json value
        +str description
        +get(key str) json
    }
    class AuditLog {
        +str action
        +str target_type
        +str target_id
        +str ip
        +str user_agent
        +json changes
    }
    class AppVersionPolicy {
        +ClientPlatform platform
        +str min_version
        +str latest_version
        +str store_url
        +LocalizedText message
        +requires_update(version str) bool
    }
    class User {
        <<accounts>>
    }

    User "1" *-- "*" Notification : inbox
    Notification "1" *-- "*" NotificationDelivery
    NotificationTemplate ..> Notification : renders
    User "0..1" --> "*" FileObject : owns
    User "0..1" --> "*" AuditLog : actor
    User "0..1" --> "*" Setting : last updated
```

---

## 6. Value objects

```mermaid
classDiagram
    class Money {
        <<value object>>
        +int amount_poisha
        +str currency
        +add(other Money) Money
        +subtract(other Money) Money
        +multiply(qty int) Money
        +percent(basis_points int) Money
        +format(lang Language) str
    }
    class PhoneNumber {
        <<value object>>
        +str e164
        +parse(raw str) PhoneNumber
        +masked() str
    }
    class LocalizedText {
        <<value object>>
        +str en
        +str bn
        +get(lang Language) str
    }
    class AddressSnapshot {
        <<value object>>
        +str recipient_name
        +str phone
        +str line1
        +str area
        +str upazila_thana
        +str district
        +str division
        +str postcode
    }
    class FeeBreakdown {
        <<value object>>
        +Money doctor_fee
        +Money platform_fee
        +Money total
    }
    class DeliveryQuote {
        <<value object>>
        +UUID rule_id
        +Money charge
        +bool cod_allowed
    }
    class TimeSlot {
        <<value object>>
        +datetime start_at
        +int duration_min
        +end_at() datetime
        +overlaps(other TimeSlot) bool
    }
    class GatewaySession {
        <<value object>>
        +str session_key
        +str gateway_url
    }
    class ValidationResult {
        <<value object>>
        +bool is_valid
        +str val_id
        +Money amount
        +str bank_tran_id
        +str card_type
        +json raw
    }
    FeeBreakdown *-- Money
    DeliveryQuote *-- Money
```

---

## 7. Services, interfaces and adapters

```mermaid
classDiagram
    class PaymentGateway {
        <<interface>>
        +initiate(payment Payment, urls CallbackUrls) GatewaySession
        +validate(val_id str) ValidationResult
        +parse_ipn(data dict) dict
        +refund(payment Payment, amount Money) str
    }
    class MockGateway
    class SSLCommerzGateway
    class SmsProvider {
        <<interface>>
        +send(to PhoneNumber, text str) str
    }
    class ConsoleSmsProvider
    class BdSmsProvider
    class PushProvider {
        <<interface>>
        +send(token str, title str, body str, data dict) str
    }
    class FcmPushProvider
    class VideoProvider {
        <<interface>>
        +create_room(name str) str
        +issue_token(room str, identity str, ttl int) str
        +close_room(name str) None
    }
    class LiveKitProvider
    class StorageProvider {
        <<interface>>
        +upload_url(key str, mime str) str
        +download_url(key str, ttl int) str
        +delete(key str) None
    }
    class S3StorageProvider
    class RemedyFinder {
        <<interface>>
        +find(description str, profile PatientProfile) List~FinderResult~
    }
    class DisabledRemedyFinder

    PaymentGateway <|.. MockGateway
    PaymentGateway <|.. SSLCommerzGateway
    SmsProvider <|.. ConsoleSmsProvider
    SmsProvider <|.. BdSmsProvider
    PushProvider <|.. FcmPushProvider
    VideoProvider <|.. LiveKitProvider
    StorageProvider <|.. S3StorageProvider
    RemedyFinder <|.. DisabledRemedyFinder

    class StateMachine {
        <<abstract>>
        +dict transitions
        +can(from_status str, to_status str) bool
        +transition(obj Model, to_status str, actor User, reason str) None
    }
    class ConsultationStateMachine
    class OrderStateMachine
    class PaymentStateMachine
    class AppointmentStateMachine
    class DoctorStateMachine
    class InvoiceStateMachine
    StateMachine <|-- ConsultationStateMachine
    StateMachine <|-- OrderStateMachine
    StateMachine <|-- PaymentStateMachine
    StateMachine <|-- AppointmentStateMachine
    StateMachine <|-- DoctorStateMachine
    StateMachine <|-- InvoiceStateMachine

    class AuthService {
        +signup_patient(data) User
        +signup_doctor(data) User
        +verify_otp(verification_id str, code str) TokenPair
        +login(identifier str, password str, user_type UserType) TokenPair
        +refresh(token str) TokenPair
        +reset_password(phone PhoneNumber, code str, new str) None
    }
    class DoctorConsultationService {
        +submit(patient PatientProfile, concerns list) DoctorConsultation
        +assign(consultation DoctorConsultation, doctor DoctorProfile, by User) None
        +withdraw(consultation DoctorConsultation, reason str) None
        +send_questions(consultation DoctorConsultation, questions list) QuestionSet
        +record_answers(question_set QuestionSet, answers list) None
    }
    class AppointmentService {
        +propose(consultation DoctorConsultation, slot TimeSlot) VideoAppointment
        +respond(appointment VideoAppointment, action AppointmentAction, note str) None
        +start_call(appointment VideoAppointment) CallSession
        +join_call(call CallSession, patient PatientProfile) str
    }
    class PrescriptionService {
        +issue(consultation DoctorConsultation, data dict) Prescription
        +revise(prescription Prescription, data dict) Prescription
        +view_for_patient(consultation DoctorConsultation) dict
    }
    class FeeCalculator {
        +calculate(doctor DoctorProfile) FeeBreakdown
    }
    class CheckoutService {
        +quote(cart Cart, address Address) DeliveryQuote
        +place_order(cart Cart, address Address, method PaymentMethod) Order
    }
    class DeliveryChargeCalculator {
        +quote(district str, subtotal Money) DeliveryQuote
    }
    class InventoryService {
        +reserve(order Order) None
        +release(order Order) None
        +commit(order Order) None
        +return_stock(order Order) None
    }
    class PaymentService {
        +start(payable Model, client ClientPlatform) GatewaySession
        +handle_ipn(data dict) Payment
        +reconcile_pending() int
        +record_cod(order Order, amount Money, by User) Payment
        +refund(payment Payment, amount Money, reason str) Refund
    }
    class NotificationService {
        +notify(user User, event_type str, context dict) Notification
    }
    class AuditService {
        +record(actor User, action str, target Model, changes dict) None
    }

    PaymentService ..> PaymentGateway
    PaymentService ..> PaymentStateMachine
    CheckoutService ..> DeliveryChargeCalculator
    CheckoutService ..> InventoryService
    PrescriptionService ..> FeeCalculator
    DoctorConsultationService ..> ConsultationStateMachine
    AppointmentService ..> VideoProvider
    AppointmentService ..> AppointmentStateMachine
    NotificationService ..> SmsProvider
    NotificationService ..> PushProvider
```

---

## 8. Enumerations

All enums are stored as upper-case text codes. The full list with every allowed value is in the data dictionary, [06-data-dictionary.md §17](06-data-dictionary.md#17-enumerations).
