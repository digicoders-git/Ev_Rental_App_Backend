# EV Rental API Documentation

## 1. Authentication APIs

### A. Send OTP (Login/Register)
- **URL**: `/api/auth/send-otp`
- **Method**: `POST`
- **Body (JSON)**: `{"mobile": "9876543210"}`
- **Note**: Fixed to `123456` for testing.

### B. Verify OTP
- **URL**: `/api/auth/verify-otp`
- **Method**: `POST`
- **Body (JSON)**: `{"mobile": "9876543210", "otp": "123456"}`

---

## 2. Admin Authentication APIs

### A. Register Admin
Creates a new admin account with email and password.
- **URL**: `/api/auth/admin/register`
- **Method**: `POST`
- **Body (JSON)**:
```json
{
  "name": "Admin Name",
  "email": "admin@example.com",
  "mobile": "9876543210",
  "password": "strongpassword"
}
```

### B. Admin Login
Login using email and password.
- **URL**: `/api/auth/admin/login`
- **Method**: `POST`
- **Body (JSON)**:
```json
{
  "email": "admin@example.com",
  "password": "strongpassword"
}
```

---

## 3. User & Admin Profile APIs (Protected)
*Requires Header: `Authorization: Bearer <token>`*

- **Update Profile**: `PUT /api/user/profile`
- **Change Password**: `PUT /api/user/change-password`
- **Credit Score**: `GET /api/user/credit-score`

### A. Update Profile Details
```json
{
  "name": "Updated Name",
  "email": "updated@email.com",
  "mobile": "1234567890",
  "password": "newpassword",
  "role": "admin"
}
```

### B. Change Password
Verify identity and update password.
- **URL**: `/api/user/change-password`
- **Method**: `PUT`
- **Body (JSON)**:
```json
{
  "oldPassword": "CurrentPassword123",
  "newPassword": "NewStrongPassword456"
}
```

### C. Get Rider Credit Score (Dynamic)
Calculates and returns the user's trust score based on their history.
- **URL**: `/api/user/credit-score`
- **Method**: `GET`
- **Logic**:
  - **Base**: 700 Points
  - **KYC Verified**: +50 Points
  - **Completed Booking**: +10 Points (each)
  - **Late Return**: -20 Points (each)
  - **Cancellation**: -10 Points (each)
- **Score Range**: 300 (Poor) to 900 (Excellent)

---

## 4. Admin User Management APIs (Admin Only)
*Requires Header: `Authorization: Bearer <token>` and Admin Role*

### A. Add New Rider
Manually add a new rider (user) to the system.
- **URL**: `/api/user/admin/add-rider`
- **Method**: `POST`
- **Body (JSON)**:
```json
{
  "name": "Rider Name",
  "email": "rider@example.com",
  "mobile": "9988776655",
  "password": "optionalPassword"
}
```

### B. List All Users
Fetches all registered users in the system.
- **URL**: `/api/user/admin/all`
- **Method**: `GET`

### C. Get User Details
Fetches full details of a specific user including their KYC and booking history.
- **URL**: `/api/user/admin/:id`
- **Method**: `GET`

### D. Update User Status / Role
Manage user accounts (Block/Active) or update roles.
- **URL**: `/api/user/admin/:id`
- **Method**: `PUT`
- **Body (JSON)**:
```json
{
  "status": "blocked", // active, blocked
  "block_reason": "Violation of terms",
  "role": "admin",     // user, admin
  "credit_score": 750
}
```
**Full Flow**: Blocks users immediately. Any further requests by a blocked user will return `403 Forbidden` with the reason.


### E. Delete User
Permanently remove a user and their associated KYC records.
- **URL**: `/api/user/admin/:id`
- **Method**: `DELETE`

---

## 5. EV Vehicle Listing APIs

### A. Create Vehicle (Protected)
Adds a new EV. Use `multipart/form-data`.
- **URL**: `/api/vehicles`
- **Method**: `POST`
- **Body (form-data)**:

| Category | Field Name | Type | Example / Note |
| :--- | :--- | :--- | :--- |
| **Basic** | `vehicle_name` | Text | Ola S1 Pro |
| | `brand` | Text | Ola Electric |
| | `model` | Text | Gen 2 |
| | `vehicle_type` | Text | car / bike / scooter |
| | `year` | Number | 2024 |
| | `color` | Text | Onyx Black |
| **ID** | `registration_number`| Text | UP32 AB 1234 |
| | `vehicle_id` | Text | EV-001 (Unique) |
| **EV Info**| `battery_capacity` | Text | 4 kWh |
| | `range_per_charge` | Text | 181 km |
| | `charging_time` | Text | 6.5 hours |
| | `charger_type` | Text | Portable / Fast |
| **Media** | `thumbnail_image` | File | Single Image |
| | `images` | File | Multiple (upto 10) |
| **Docs** | `rc_document` | File | Single (PDF/Img) |
| | `insurance_valid_till`| Date | 2025-12-31 |
| **Status** | `status` | Text | active / inactive / maintenance |
| | `vehicle_condition` | Text | New / Good |
| **Extra** | `description` | Text | Detailed description... |
| | `features` | Text | AC, GPS, Bluetooth (Comma separated) |
| | `price_per_day` | Number | 500 |
| | `franchise` | ObjectID | Franchise Store Mongo ID (Optional) |

### B. View APIs
- **Get All**: `GET /api/vehicles` (Query Param: `franchiseId=XXXX` to filter)
- **Get Single**: `GET /api/vehicles/:id`

### C. Update & Delete (Protected)
- **Update**: `PUT /api/vehicles/:id` (Same form-data as Create)
- **Delete**: `DELETE /api/vehicles/:id`

### D. Assign Vehicle to Franchise (Admin)
Map a vehicle to a specific store.
- **URL**: `/api/vehicles/:id/assign`
- **Method**: `PUT`
- **Body (JSON)**: `{"franchiseId": "STORE_MONGO_ID"}`

### E. Get My Store Vehicles (Franchise Owner)
- **Auth**: Franchise Token Required

### F. Check Vehicle Availability (Date Based)
Checks if the vehicle is free and active for a specific date range.
- **URL**: `/api/vehicles/:id/availability`
- **Method**: `GET`
- **Query Params**: `start_date`, `end_date` (YYYY-MM-DD)
- **Response**: Returns `is_available` true/false.

---

## 6. Offers & Deals APIs

### A. Create Offer/Coupon (Admin)
- **URL**: `/api/offers`
- **Method**: `POST`
- **Body (JSON)**:
```json
{
  "title": "EV Fest Offer",
  "coupon_code": "SAVE500", 
  "offer_type": "discount_percentage", // or flat_discount
  "discount_value": 15,
  "max_discount_amount": 1000,
  "min_booking_amount": 1200,
  "usage_limit": 100, // 0 for unlimited
  "applicable_vehicle_ids": ["EV-001"],
  "start_date": "2026-04-01",
  "end_date": "2026-04-30",
  "status": "active"
}
```

### B. Validate Coupon (User)
Check if a coupon is valid for the current booking.
- **URL**: `/api/offers/validate`
- **Method**: `POST`
- **Body (JSON)**: `{"code": "SAVE500", "amount": 2000, "vehicle_id": "EV-001"}`

### C. Manage Offers (Admin)
- **Toggle Status**: `PATCH /api/offers/:id/toggle`
- **Update**: `PUT /api/offers/:id`
- **Delete**: `DELETE /api/offers/:id`

---

## 7. Franchise Enquiry APIs

### A. Submit Enquiry (Public)
- **URL**: `/api/franchise-enquiry`
- **Method**: `POST`
- **Auth**: None
- **Body (JSON)**:
```json
{
  "full_name": "John Doe",
  "phone_number": "9876543210",
  "email": "john@example.com",
  "city": "Lucknow",
  "state": "Uttar Pradesh",
  "investment_budget": "5-10 Lakhs",
  "message": "Interested in opening a franchise."
}
```

### B. List Enquiries (Admin)
- **URL**: `/api/franchise-enquiry`
- **Method**: `GET`
- **Auth**: Required (Bearer Token)
- **Query Params**: `status`, `city`, `start_date`, `end_date`

### C. Update Status & Follow-up (Admin)
- **URL**: `/api/franchise-enquiry/:id/status`
- **Method**: `PATCH`
- **Auth**: Required (Bearer Token)
- **Body (JSON)**:
```json
{
  "status": "interested",
  "notes": "Spoke to him, ready for meeting.",
  "follow_up_date": "2026-05-01"
}
```

---

## 7.2 Franchise Store Management APIs (Admin)
*Requires Header: `Authorization: Bearer <token>` and Admin Role*

### A. Add New Franchise Store
Register an official franchise outlet.
- **URL**: `/api/franchise-enquiry/stores`
- **Method**: `POST`
- **Body (JSON)**:
```json
{
  "store_name": "EV Rental Lucknow Central",
  "owner_name": "Rajesh Gupta",
  "mobile": "9876543210",
  "email": "rajesh@evcentral.com",
  "password": "store_password_123",
  "address": "12/A, Hazratganj Metro Station Park",
  "city": "Lucknow",
  "state": "Uttar Pradesh",
  "agreement_date": "2026-04-20",
  "expiry_date": "2027-04-20"
}
```

### B. View Stores
- **Get All**: `GET /api/franchise-enquiry/stores`
- **Get Single**: `GET /api/franchise-enquiry/stores/:id` (Returns store details + **assigned_vehicles**)

### C. Update Store Details
- **URL**: `/api/franchise-enquiry/stores/:id`
- **Method**: `PUT`
- **Body**: Same as Create.

### D. Delete Store
- **URL**: `/api/franchise-enquiry/stores/:id`
- **Method**: `DELETE`

---

## 7.3 Franchise Owner Auth & Profile APIs
*Owner specific portal access*

### A. Franchise Login
- **URL**: `/api/franchise-enquiry/login`
- **Method**: `POST`
- **Body (JSON)**: 
```json
{
  "email": "rajesh@evcentral.com",
  "password": "store_password_123"
}
```

### B. Get My Profile
- **URL**: `/api/franchise-enquiry/profile`
- **Method**: `GET`
- **Auth**: Required (Franchise Bearer Token)

### C. Update My Profile (w/ Image)
Update store details and profile picture. Stores locally in `uploads/`.
- **URL**: `/api/franchise-enquiry/profile`
- **Method**: `PUT`
- **Auth**: Required (Franchise Bearer Token)
- **Body (form-data)**: 
  - `store_name`, `owner_name`, `mobile`, `address`, `city`, `state`
  - `profile_image` (File)

### D. Change Password
- **URL**: `/api/franchise-enquiry/change-password`
- **Method**: `PUT`
- **Auth**: Required (Franchise Bearer Token)
- **Body (JSON)**: 
```json
{
  "oldPassword": "CurrentPassword123",
  "newPassword": "NewStrongPassword456"
}
```

---

## 7.4 Franchise Revenue Tracking APIs
*Monitor earnings and booking stats*

### A. Get My Revenue (Franchise Owner)
- **URL**: `/api/franchise-enquiry/revenue`
- **Method**: `GET`
- **Auth**: Required (Franchise Token)
- **Query Params**: `start_date`, `end_date` (Optional)
- **Data Returned**: Total Revenue, Total Bookings, Late Fees, and Average Booking Value.

### B. View Franchise Revenue (Admin)
Admin can check the revenue of any specific store.
- **URL**: `/api/franchise-enquiry/admin/revenue/:id`
- **Method**: `GET`
- **Auth**: Required (Admin Token)
- **Query Params**: `start_date`, `end_date`

---

## 8. Rental Plan APIs

### A. Create Plan (Protected)
- **URL**: `/api/plans`
- **Method**: `POST`
- **Auth**: Required (Bearer Token)
- **Body (JSON)**:
```json
{
  "plan_name": "Daily Plan",
  "pricing_type": "daily",
  "price": 1200,
  "security_deposit": 3000,
  "min_duration": 1,
  "max_duration": 30,
  "grace_period": 30,
  "status": "active"
}
```

### B. View APIs
- **Get All**: `GET /api/plans`
- **Get Single**: `GET /api/plans/:id`

### C. Update Plan
- **URL**: `/api/plans/:id`
- **Method**: `PUT`

### D. Delete Plan
- **URL**: `/api/plans/:id`
- **Method**: `DELETE`

### E. Pricing Control (Quick Update)
Allows admin to update only the pricing components of a plan.
- **URL**: `/api/plans/:id/price`
- **Method**: `PATCH`
- **Body (JSON)**:
```json
{
  "price": 550,
  "late_fee_per_hour": 120,
  "security_deposit": 2500
}
```

### F. Toggle Plan Status (Activate/Deactivate)
Quickly switch a plan between `active` and `inactive`.
- **URL**: `/api/plans/:id/toggle-status`
- **Method**: `PATCH`

---

## 9. EV Booking APIs (Protected)
*Requires Header: `Authorization: Bearer <token>`*

### A. Create Booking
- **URL**: `/api/bookings`
- **Method**: `POST`
- **Body (JSON)**:
```json
{
  "vehicle": "VEHICLE_MONGO_ID",
  "plan": "PLAN_MONGO_ID",
  "start_date": "2026-05-01T10:00:00Z",
  "end_date": "2026-05-02T10:00:00Z",
  "pickup_location": "Lucknow Station",
  "drop_location": "Airport Terminal 1",
  "payment_method": "online",
  "total_amount": 1200,
  "discount_amount": 100
}
```

### B. My Bookings (User)
Fetches bookings of the logged-in user.
- **URL**: `/api/bookings/my`
- **Method**: `GET`

### C. Get Single Booking (User/Admin)
Allows a user to see their own booking, or Admin to see ANY booking.
- **URL**: `/api/bookings/:id`
- **Method**: `GET`

### D. Get All Bookings (Admin/Franchise)
- **URL**: `/api/bookings`
- **Method**: `GET`
- **Query Params**: `franchiseId` (optional), `status` (optional)
- **Note**: Admin can see all, Franchise can filter.

### E. Update Booking Status (Admin/Franchise)
- **URL**: `/api/bookings/:id/status`
- **Method**: `PATCH`
- **Auth**: Admin or Franchise Owner of the vehicle.
- **Body (JSON)**:
```json
{
  "booking_status": "confirmed",
  "payment_status": "paid",
  "transaction_id": "TXN987654"
}
```

### F. Calculate Potential Late Fee
Calculates the penalty based on current time vs scheduled return time.
- **URL**: `/api/bookings/:id/calculate-late-fee`
- **Method**: `GET`

### G. Return Vehicle (Complete Booking)
Marks vehicle as returned, calculates final late fee, and updates status to `completed`.
- **URL**: `/api/bookings/:id/return`
- **Method**: `POST`

### H. Get My Franchise Bookings (Franchise Owner)
Lists all bookings for vehicles belonging to the logged-in franchise.
- **URL**: `/api/bookings/franchise/my`
- **Method**: `GET`
- **Auth**: Franchise Token Required

---

## 10. KYC (Know Your Customer) APIs (Protected)
*Requires Header: `Authorization: Bearer <token>`*

### A. Submit KYC Documents
Uploads Aadhar, DL, and User Photo for verification. Use `multipart/form-data`.
- **URL**: `/api/kyc/submit`
- **Method**: `POST`
- **Body (form-data)**:

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `aadharNumber` | Text | 12 digit Aadhar number |
| `aadharFront` | File | Front side of Aadhar card |
| `aadharBack` | File | Back side of Aadhar card |
| `drivingLicenseNumber`| Text | DL number |
| `drivingLicenseFront` | File | Front side of Driving License |
| `drivingLicenseBack` | File | Back side of Driving License |
| `userPhoto` | File | **(Mandatory)** User's own photo / selfie |

### B. Get My KYC Status
Checks the current verification status of the user's documents.
- **URL**: `/api/kyc/my-status`
- **Method**: `GET`

### C. Track KYC by Mobile (Admin)
Allows admin to search and track the KYC status of any user using their mobile number.
- **URL**: `/api/kyc/admin/track/:mobile`
- **Method**: `GET`
- **Auth**: Admin only
- **Response**: Returns full KYC details for the given mobile number.

### D. Get All KYC Submissions (Admin)
Lists all submitted KYC documents for review.
- **URL**: `/api/kyc/admin/all`
- **Method**: `GET`
- **Auth**: Admin only

### E. Update KYC Status (Admin)
Approves or Rejects a KYC submission. 
**Full Flow**: On approval, the user's `isKycVerified` field becomes `true` and `credit_score` increases by 50 points.
- **URL**: `/api/kyc/admin/status/:id`
- **Method**: `PUT`
- **Auth**: Admin only
- **Body (JSON)**:
```json
{
  "status": "approved", // approved, rejected, pending
  "rejectionReason": ""
}
```

---

## 11. GPS Tracking & IoT APIs

### A. Update Location (Simulation/IOT)
This API is typically called by the GPS device in the EV every few seconds/minutes.
- **URL**: `/api/tracking/update`
- **Method**: `POST`
- **Body (JSON)**:
```json
{
  "vehicle_id": "EV-001",
  "lat": 26.8467,
  "lng": 80.9462,
  "address": "Hazratganj, Lucknow",
  "battery_level": 85,
  "speed": 40
}
```

### B. Get Live Location
Fetches the current real-time coordinates and battery status of a vehicle.
- **URL**: `/api/tracking/live/:vehicleMongoId`
- **Method**: `GET`
- **Auth**: Protected

### C. Get Tracking History
Fetches historical movement data for a vehicle within a time range.
- **URL**: `/api/tracking/history/:vehicleMongoId?start_date=...&end_date=...`
- **Method**: `GET`
- **Auth**: Protected

### D. Get Booking Trip History
Shows the full path taken during a specific rental booking.
- **URL**: `/api/tracking/booking/:bookingMongoId`
- **Method**: `GET`
- **Auth**: Protected

### E. Get My Franchise Fleet Tracking (Franchise Owner)
Real-time tracking for all vehicles assigned to this franchise store.
- **URL**: `/api/tracking/franchise/fleet`
- **Method**: `GET`
- **Auth**: Franchise Token Required

### F. Get Franchise Vehicle History (Franchise Owner)
Historical movement data for a specific assigned vehicle.
- **URL**: `/api/tracking/franchise/history/:id`
- **Method**: `GET`
- **Auth**: Franchise Token Required
- **Query Params**: `start_date`, `end_date`

---

## 12. Vehicle Reviews & Ratings APIs

### A. Add Review
Add a rating and comment for a vehicle after a completed trip.
- **URL**: `/api/reviews`
- **Method**: `POST`
- **Auth**: Protected
- **Body (JSON)**:
```json
{
  "bookingId": "65a123...",
  "rating": 5, // Number (1-5)
  "comment": "Amazing bike with great battery life!"
}
```

### B. Get Vehicle Reviews
Lists all reviews for a specific vehicle.
- **URL**: `/api/reviews/vehicle/:vehicleMongoId`
- **Method**: `GET`

---

## 13. Support & Complaints APIs (Protected)

### A. Create Support Ticket (User)
- **URL**: `/api/support/ticket`
- **Method**: `POST`
- **Body (Multipart/Form-Data)**:
  - `category`: Vehicle Issue, Billing/Payment, etc.
  - `subject`: Summary
  - `description`: Detailed issue
  - `booking`: (Optional) Booking ID related to complaint
  - `attachments`: (Optional) Up to 5 images/screenshots
- **Note**: This automatically notifies the Admin.

### B. Track My Tickets (User)
View status of all tickets raised by the current user.
- **URL**: `/api/support/my-tickets`
- **Method**: `GET`

### C. Admin Workspace (Admin)
- **Get All Tickets**: `GET /api/support/admin/all`
- **Reply & Update Status**: `PUT /api/support/admin/ticket/:id`
  - **Body (JSON)**: `{"status": "in-progress", "admin_reply": "We are checking..."}`
- **Note**: Updating a ticket automatically notifies the User via system notification.

---

## 14. Due Payment Tracking APIs (Rider-wise)
*Monitor outstanding balances and unpaid late fees*

### A. Get My Due Payments (User)
Shows all pending payments for the logged-in rider.
- **URL**: `/api/bookings/dues/my`
- **Method**: `GET`
- **Auth**: Required (User Token)

### B. Track Dues by Mobile (Admin)
Admin can check the outstanding balance of any specific rider.
- **URL**: `/api/bookings/admin/dues?mobile=9988776655`
- **Method**: `GET`
- **Auth**: Admin only

### C. Mark Payment Paid Manually (Admin)
Allows admin to record a payment (full or partial) for a booking's outstanding balance.
- **URL**: `/api/bookings/:id/pay-manual`
- **Method**: `POST`
- **Auth**: Admin only
- **Body (JSON)**:
```json
{
  "amount": 200, // Optional: defaults to full remaining due
  "payment_method": "cash", // online, cash, wallet, other
  "transaction_id": "CASH_001"
}
```

### D. Cancel Booking
Allows a rider to cancel a booking (only if status is `pending` or `confirmed`).
- **URL**: `/api/bookings/:id/cancel`
- **Method**: `POST`
- **Body**: `{"reason": "Personal issues"}`

### E. Extend Booking
Allows a rider to extend their rental duration.
- **URL**: `/api/bookings/:id/extend`
- **Method**: `POST`
- **Body**: `{"extra_days": 2}`
- **Note**: This automatically recalculates and adds the extra cost to the `grand_total`.

### F. Approve Booking (Admin/Franchise)
Confirms a pending booking. 
**Full Flow**: System checks if the rider's KYC is `approved` before allowing confirmation.
- **URL**: `/api/bookings/:id/approve`
- **Method**: `PATCH`
- **Auth**: Admin/Franchise Token

### G. Reject Booking (Admin/Franchise)
Rejects a pending booking with a reason.
- **URL**: `/api/bookings/:id/reject`
- **Method**: `PATCH`
- **Body**: `{"reason": "Vehicle under maintenance"}`

## 15. Manage Notifications APIs
*System alerts for Admin/Franchise and Communications for Users*

### A. Get My Notifications
Fetch latest notifications (Admin sees system alerts, User sees their alerts).
- **URL**: `/api/notifications`
- **Method**: `GET`
- **Auth**: Required
- **Response**: Returns `unread_count` and list of notifications.

### B. Mark as Read
- **Mark Single**: `PATCH /api/notifications/:id/read`
- **Mark All**: `PATCH /api/notifications/read-all`

### C. Broadcast Notification (Admin Only)
Send a message to all registered users.
- **URL**: `/api/notifications/broadcast`
- **Method**: `POST`
- **Body**: `{"title": "Weekend Offer!", "message": "Get 20% off this Sunday on all EVs!"}`

---

## 16. Reports & Analysis APIs (Admin Only)
*Real-time data aggregation and business intelligence*

### A. Dashboard Statistics
Get quick counts of revenue, bookings, users, and fleet.
- **URL**: `/api/reports/dashboard-stats`
- **Method**: `GET`
- **Auth**: Admin only

### B. Revenue Analysis
Get revenue grouped by day or month.
- **URL**: `/api/reports/revenue-analysis?timeframe=daily`
- **Options**: `timeframe=daily` or `monthly`
- **Method**: `GET`

### C. Franchise Performance
See which franchise store is generating the most revenue.
- **URL**: `/api/reports/franchise-performance`
- **Method**: `GET`

### D. Export Data (CSV)
Download all booking records in CSV format.
- **URL**: `/api/reports/export/bookings`
- **Method**: `GET`

---

## 17. Content Management System (CMS) APIs
*Manage static pages, legal documents, FAQs, and app banners.*

### A. Create Content (Admin Only)
Adds new page, FAQ, or banner. Use `multipart/form-data`.
- **URL**: `/api/content`
- **Method**: `POST`
- **Auth**: Admin Only
- **Body (form-data)**:
  - `slug`: (Required) unique-url-slug (e.g., terms-and-conditions)
  - `title`: (Required) Display title
  - `description`: (Required) Detailed content or description
  - `type`: `page`, `faq`, `banner`, `testimonial`, `contact`
  - `category`: (Optional) e.g., 'legal', 'general', 'app-home'
  - `order`: (Number) for sorting
  - `isActive`: (Boolean)
  - `image`: (File) Optional image/banner

### B. List Content (Public)
- **URL**: `/api/content`
- **Method**: `GET`
- **Query Params**: `type`, `category`, `isActive`
- **Example**: `GET /api/content?type=faq&category=payment`

### C. Get Content by Slug (Public)
- **URL**: `/api/content/:slug`
- **Method**: `GET`
- **Example**: `GET /api/content/privacy-policy`

### D. Update Content (Admin Only)
- **URL**: `/api/content/:id`
- **Method**: `PUT`
- **Body**: Same as Create (form-data).

### E. Toggle Status (Admin Only)
- **URL**: `/api/content/:id/toggle`
- **Method**: `PATCH`

### F. Delete Content (Admin Only)
- **URL**: `/api/content/:id`
- **Method**: `DELETE`

---

## Technical Setup
- **Models**: `User`, `Vehicle`, `Offer`, `FranchiseEnquiry`, `FranchiseStore`, `RentalPlan`, `Booking`, `KYC`, `Tracking`, `Content`
- **Endpoints**: `/api/auth`, `/api/user`, `/api/vehicles`, `/api/offers`, `/api/franchise-enquiry`, `/api/plans`, `/api/bookings`, `/api/kyc`, `/api/tracking`, `/api/support`, `/api/reviews`, `/api/content`, `/api/reports`, `/api/notifications`
- **Middleware**: `authMiddleware` (protect, admin, franchiseProtect, anyProtect), `uploadMiddleware`
- **Upload Folders**: `/uploads`, `/uploads/franchise`

