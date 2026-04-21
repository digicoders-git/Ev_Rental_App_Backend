# KYC Implementation Details

## Workflow
1. **Model (`kycModel.js`)**:
   - Stores `user` reference.
   - Stores `aadharNumber` and `drivingLicenseNumber`.
   - Stores relative paths for 4 images: `aadharFront`, `aadharBack`, `drivingLicenseFront`, `drivingLicenseBack`.
   - `status` field tracks progress: `pending` (default), `approved`, `rejected`.
   - `rejectionReason` field for feedback to the user.

2. **Controller (`kycController.js`)**:
   - `submitKYC`: Uses `multer` to handle multipart/form-data. It checks if the user has already submitted KYC. If yes, it overwrites the fields and deletes old files to save storage.
   - `getMyKYCStatus`: Simple fetch for the logged-in user.
   - `getAllKYCSubmissions`: Fetches all records with user details (populated) for the admin dashboard.
   - `updateKYCStatus`: Allows admin to change status and provide a reason for rejection.

3. **Routes (`kycRoutes.js`)**:
   - `/api/kyc/submit`: `POST` (Protected).
   - `/api/kyc/my-status`: `GET` (Protected).
   - `/api/kyc/admin/all`: `GET` (Protected/Admin).
   - `/api/kyc/admin/status/:id`: `PUT` (Protected/Admin).

4. **Middleware**:
   - `authMiddleware.js`: Enhanced with an `admin` check function to verify if `req.user.role === 'admin'`.
   - `uploadMiddleware.js`: Used to process image uploads into the `uploads/` folder.

## Database Schema
```javascript
{
    user: ObjectId (ref: 'User'),
    aadharNumber: String,
    aadharFront: String (Path),
    aadharBack: String (Path),
    drivingLicenseNumber: String,
    drivingLicenseFront: String (Path),
    drivingLicenseBack: String (Path),
    status: Enum ['pending', 'approved', 'rejected'],
    rejectionReason: String
}
```

## How to Test
1. **Login** to get a Bearer Token.
2. **Post KYC**: Use Postman with `form-data`. Attach 4 files and 2 text fields.
3. **Admin Check**: Ensure your user role is set to `admin` in MongoDB to access admin routes.
