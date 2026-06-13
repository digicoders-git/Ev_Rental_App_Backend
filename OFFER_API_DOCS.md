# EV Rental - Offer & Coupon System API Documentation

This document outlines the complete flow and API endpoints for the Offer/Coupon system, including the newly added Claim Offer functionality.

---

## 1. Offer Flow (How it works in the App)

1. **Viewing Offers**: 
   - The app fetches all active offers from `GET /api/offers` and displays them on the "Offers" screen.
2. **Claiming an Offer (Wallet / Save for later)**:
   - When the user clicks the "Claim" or "Save" button on an offer, the app calls `POST /api/offers/claim`.
   - This saves the offer to the user's digital wallet (`claimed_offers` array in the User database).
3. **Viewing Claimed Offers (My Wallet)**:
   - When the user goes to "My Offers", the app calls `GET /api/offers/my-claims`.
   - This returns all the offers the user has claimed, along with their details.
4. **Validating / Applying an Offer at Checkout**:
   - During the booking/checkout process, the user enters a coupon code or selects a claimed offer.
   - The app calls `POST /api/offers/validate` passing the code, booking amount, and vehicle ID.
   - The backend calculates the discount and returns the final amount.

---

## 2. API Endpoints for Users (Frontend/App)

### 2.1 Get All Offers
Fetches a list of all offers.
- **URL:** `GET /api/offers`
- **Auth:** Public
- **Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "664c123abc456def7890",
      "title": "Welcome Bonus",
      "offer_type": "flat_discount",
      "coupon_code": "WELCOME50",
      "min_booking_amount": 500,
      "discount_value": 50,
      "status": "active",
      "start_date": "2024-01-01T00:00:00.000Z",
      "end_date": "2024-12-31T00:00:00.000Z"
    }
  ]
}
```

### 2.2 Claim an Offer
Saves a specific offer to the user's account.
- **URL:** `POST /api/offers/claim`
- **Auth:** Protected (Requires Bearer Token)
- **Request Body:**
```json
{
  "offerId": "664c123abc456def7890"
}
```
- **Success Response (200):**
```json
{
  "success": true,
  "message": "Offer claimed successfully"
}
```
- **Error Response (400 - Already Claimed):**
```json
{
  "success": false,
  "message": "You have already claimed this offer"
}
```

### 2.3 Get My Claimed Offers (Wallet)
Fetches all offers that the logged-in user has claimed.
- **URL:** `GET /api/offers/my-claims`
- **Auth:** Protected (Requires Bearer Token)
- **Response:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "offer": {
        "_id": "664c123abc456def7890",
        "title": "Welcome Bonus",
        "offer_type": "flat_discount",
        "coupon_code": "WELCOME50",
        "discount_value": 50,
        "status": "active"
      },
      "status": "claimed",
      "claimedAt": "2024-06-12T08:00:00.000Z",
      "_id": "664d999xyz..."
    }
  ]
}
```

### 2.4 Validate / Apply Coupon
Validates the coupon code and calculates the discount amount for a booking.
- **URL:** `POST /api/offers/validate`
- **Auth:** Protected (Requires Bearer Token)
- **Request Body:**
```json
{
  "code": "WELCOME50",
  "amount": 1000,
  "vehicle_id": "65bfa222..." // Optional, if coupon is restricted to specific vehicles
}
```
- **Success Response (200):**
```json
{
  "success": true,
  "message": "Coupon applied successfully",
  "data": {
    "offer_id": "664c123abc456def7890",
    "discount_amount": 50,
    "final_amount": 950,
    "title": "Welcome Bonus"
  }
}
```
- **Error Response (400 - Validation Failed):**
```json
{
  "success": false,
  "message": "Minimum booking of INR 500 required" // OR "Coupon invalid or expired"
}
```

---

## 3. API Endpoints for Admin Panel

### 3.1 Create Offer
- **URL:** `POST /api/offers`
- **Auth:** Admin
- **Request Body:**
```json
{
  "title": "Summer Sale",
  "offer_type": "discount_percentage", // or "flat_discount"
  "coupon_code": "SUMMER20",
  "min_booking_amount": 1000,
  "discount_value": 20,
  "max_discount_amount": 200,
  "start_date": "2024-06-01",
  "end_date": "2024-06-30"
}
```

### 3.2 Update Offer
- **URL:** `PUT /api/offers/:id`
- **Auth:** Admin
- **Request Body:** Any fields to update.

### 3.3 Toggle Offer Status
Quickly activate or deactivate an offer.
- **URL:** `PATCH /api/offers/:id/toggle`
- **Auth:** Admin
- **Response:**
```json
{
  "success": true,
  "message": "Offer inactive",
  "data": { ... }
}
```

### 3.4 Delete Offer
- **URL:** `DELETE /api/offers/:id`
- **Auth:** Admin
