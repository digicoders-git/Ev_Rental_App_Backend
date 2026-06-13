# EV Rental - Vehicle Category API Documentation

This document outlines the API endpoints to manage Vehicle Categories, which now include support for dynamic image uploads using `multipart/form-data`.

---

## 1. Get All Categories
Fetches all active and inactive vehicle categories.
- **URL:** `GET /api/categories`
- **Auth:** Public
- **Response (200 OK):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "664c123abc456def7890",
      "name": "Electric Scooters",
      "description": "2-wheeler electric scooters",
      "image": "uploads/1715612345-scooter.jpg",
      "status": "active",
      "createdAt": "2024-05-13T10:00:00.000Z",
      "updatedAt": "2024-05-13T10:00:00.000Z",
      "__v": 0
    }
  ]
}
```

---

## 2. Create Category (With Image Upload)
Creates a new vehicle category. Supports image file uploads via `multipart/form-data`.
- **URL:** `POST /api/categories`
- **Auth:** Public (For testing - later will be Protected Admin route)
- **Headers:** `Content-Type: multipart/form-data`
- **Request Body (FormData):**
  - `name`: (Text) "Electric Bikes" *(Required)*
  - `description`: (Text) "High speed electric bikes"
  - `image`: (File) *[Select an image file]*
- **Success Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "name": "Electric Bikes",
    "description": "High speed electric bikes",
    "image": "uploads/1718182233444-bike.png",
    "status": "active",
    "_id": "66695b28a123abc456def78",
    "createdAt": "2024-06-12T08:30:00.000Z",
    "updatedAt": "2024-06-12T08:30:00.000Z",
    "__v": 0
  }
}
```
- **Error Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Category already exists"
}
```

---

## 3. Update Category (With Image Upload)
Updates an existing category. You can upload a new image to replace the old one.
- **URL:** `PUT /api/categories/:id`
- **Auth:** Protected (Requires Admin Token)
- **Headers:** `Content-Type: multipart/form-data` (if uploading image) OR `application/json` (if only updating text)
- **Request Body (FormData / JSON):**
  - `name`: (Text) "Updated Category Name"
  - `status`: (Text) "inactive"
  - `image`: (File) *[Select new image file]*
- **Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "66695b28a123abc456def78",
    "name": "Updated Category Name",
    "description": "High speed electric bikes",
    "image": "uploads/1718189999999-new-bike.png",
    "status": "inactive",
    "createdAt": "2024-06-12T08:30:00.000Z",
    "updatedAt": "2024-06-12T08:45:00.000Z",
    "__v": 0
  }
}
```

---

## 4. Delete Category
Deletes a specific category. (Note: It will block deletion if there are vehicles currently using this category).
- **URL:** `DELETE /api/categories/:id`
- **Auth:** Protected (Requires Admin Token)
- **Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Category deleted"
}
```
- **Error Response (400 Bad Request - If category in use):**
```json
{
  "success": false,
  "message": "Cannot delete category. It is being used by 5 vehicles."
}
```

---

## 5. Get Vehicles Filtered by Category
Fetches all vehicles that belong to a specific category.
- **URL:** `GET /api/vehicles?category=CATEGORY_ID`
  - *Example:* `GET /api/vehicles?category=664c123abc456def7890`
- **Auth:** Public
- **Success Response (200 OK):**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "664c123abc456def7891",
      "vehicle_name": "S1 Pro",
      "brand": "Ola Electric",
      "registration_number": "UP32 AB 1234",
      "category": {
        "_id": "664c123abc456def7890",
        "name": "Electric Scooters"
      },
      "current_battery": 98,
      "range_per_charge": 150,
      "status": "active",
      "is_busy": false
    }
  ]
}
```
*(Note: This filter also works for Franchise vehicles API: `GET /api/vehicles/franchise/my?category=CATEGORY_ID`)*
