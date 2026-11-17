# REST API Documentation

Base URL: `http://localhost:5000` (or your deployed cloud backend URL).

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
Creates a new user account. The first registered user is automatically assigned the `admin` role.
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "StrongPassword123"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOi...",
    "user": {
      "id": "65f0123...",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "admin"
    }
  }
  ```

### `POST /api/auth/login`
Authenticates an existing user and returns a signed JWT.
- **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "StrongPassword123"
  }
  ```

### `GET /api/auth/me`
Fetches current user profile. Requires `Authorization: Bearer <token>`.

---

## 2. Printer Management Endpoints

### `GET /api/printers`
Lists all registered network printers. Requires JWT authentication.

### `POST /api/printers` (Admin Only)
Registers a new printer in the system.
- **Request Body**:
  ```json
  {
    "name": "HP LaserJet Pro MFP M126nw",
    "brand": "HP",
    "model": "HP LaserJet Pro MFP M126nw",
    "lanIp": "192.168.1.150",
    "ippPort": 631,
    "ippEndpoint": "/ipp/printer",
    "isDefault": true
  }
  ```

### `POST /api/printers/:id/test-connection` (Admin Only)
Sends an IPP `Get-Printer-Attributes` probe to test connectivity, paper level, toner level, and supported formats.

---

## 3. Print Jobs Endpoints

### `POST /api/jobs`
Uploads and queues a PDF document for printing. Requires `multipart/form-data`.
- **Headers**: `Authorization: Bearer <token>`
- **Form Fields**:
  - `file`: PDF file buffer
  - `printerId`: MongoDB ObjectId of target printer (optional; defaults to system default printer)
  - `copies`: integer (1 to 100)
  - `paperSize`: `"A4"` or `"Letter"`
  - `orientation`: `"PORTRAIT"`, `"LANDSCAPE"`, or `"AUTO"`
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Print job created and queued successfully.",
    "job": {
      "_id": "67b3...",
      "documentName": "invoice.pdf",
      "status": "QUEUED",
      "pageCount": 3,
      "copies": 1,
      "paperSize": "A4"
    }
  }
  ```

### `GET /api/jobs`
Lists user's print jobs (or all print jobs if user is admin).
- **Query Parameters**:
  - `page`: page number (default 1)
  - `limit`: items per page (default 20)
  - `status`: filter by status (e.g. `COMPLETED`, `QUEUED`, `FAILED`)
  - `search`: search substring in document name

### `GET /api/jobs/:id`
Retrieves full details for a print job, including complete status history timeline, IPP job ID, and verification evidence.

### `POST /api/jobs/:id/retry`
Retries a failed or cancelled print job. Increments retry count and re-places job into queue.

### `POST /api/jobs/:id/cancel`
Cancels a queued or processing print job.

---

## 4. Cloud Worker Endpoints (Protected by `X-Worker-API-Key`)

All worker endpoints require the header `X-Worker-API-Key: <WORKER_API_KEY>`.

### `POST /api/worker/heartbeat`
Cloud Worker check-in with VPN health, system memory, and uptime.
- **Request Body**:
  ```json
  {
    "workerId": "cloud-worker-1",
    "status": "ONLINE",
    "vpnStatus": "CONNECTED",
    "vpnIp": "10.14.0.2",
    "gatewayIp": "10.14.0.1",
    "version": "1.0.0"
  }
  ```

### `GET /api/worker/jobs/next`
Atomically claims the next pending print job from the queue and transitions its status to `PROCESSING`.
- **Response**:
  ```json
  {
    "success": true,
    "job": {
      "_id": "67b3...",
      "documentName": "presentation.pdf",
      "storageUrl": "https://.../presentation.pdf",
      "copies": 1,
      "paperSize": "A4"
    },
    "printer": {
      "lanIp": "192.168.1.150",
      "ippPort": 631,
      "ippEndpoint": "/ipp/printer",
      "supportedFormats": ["application/PCLm"]
    }
  }
  ```

### `PATCH /api/worker/jobs/:id/status`
Updates job status as it transitions through the printing pipeline.
- **Request Body**:
  ```json
  {
    "status": "COMPLETED",
    "message": "Physical print job completed successfully.",
    "printerJobId": "42",
    "verificationDetails": {
      "evidence": "Printer reported job-completed in IPP attributes",
      "finalPrinterState": "IDLE",
      "sheetsPrinted": 3
    }
  }
  ```

### `POST /api/worker/printers/:id/status`
Worker reports live printer status detected from within the LAN.

---

## 5. Network & Diagnostic Endpoints

### `GET /api/network/guide?brand=asus`
Fetches customized router configuration guide.

### `POST /api/network/diagnostics`
Evaluates whether a printer IP is a valid private LAN address or the HP Wi-Fi Direct subnet (`192.168.223.x`).
