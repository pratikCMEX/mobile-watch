# All API Postman Requests (JSON Body Only)

> Copy each JSON block and paste into Postman **Body → raw → JSON**
> Routes with `:id` in URL use params, not body
> Routes with `uploadProfile` or `uploadSnapshot` use **form-data**, not raw JSON

---

## 1. Create User

**POST** `/admin/create_user`

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "country_code": "+91",
  "phone_number": "9876543210"
}
```

---

## 2. List Users

**POST** `/admin/all_users`

```json
{
  "search": "",
  "page": 1,
  "sorting": "DESC",
  "limit": 20
}
```

---

## 3. Update User

**POST** `/admin/update_user`

```json
{
  "id": "USER_UUID",
  "name": "John Doe",
  "email": "john@example.com",
  "password": "newpassword123",
  "country_code": "+91",
  "phone_number": "9876543210"
}
```

---

## 4. Login

**POST** `/auth/user_login`

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

---

## 5. Update Profile (Mobile User)

Update the authenticated user's profile — name, email, phone, password, and/or
profile image.

Uses **multipart/form-data** when uploading a profile image. The image file is
sent in the `profile_image` field; text fields (`name`, `email`, etc.) are sent
as regular form fields. When no image is being uploaded, a plain JSON body also
works.

**POST** `/auth/update_profile`

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form-data fields:**

| Field                  | Type   | Required | Description                                       |
| ---------------------- | ------ | -------- | ------------------------------------------------- |
| `name`                 | string | no       | User's display name                               |
| `email`                | string | no       | User's email address                              |
| `phone_number`         | string | no       | User's phone number                               |
| `country_code`         | string | no       | e.g. `+91`                                        |
| `password`             | string | no       | New password (min 6 chars)                        |
| `profile_image`        | file   | no       | Profile image file (jpeg, jpg, png, webp)         |
| `remove_profile_image` | bool   | no       | Set to `true` to remove the current profile image |

**Response fields:**

| Field           | Type   | Description                             |
| --------------- | ------ | --------------------------------------- |
| `id`            | string | User UUID                               |
| `name`          | string | User's display name                     |
| `email`         | string | User's email address                    |
| `phone_number`  | string | User's phone number                     |
| `country_code`  | string | Country code (e.g. `+91`)               |
| `profile_image` | string | Full URL to the profile image (or null) |

---

## 6. Update Device Settings

**POST** `/user/device/update_device_settings`

> When `fall_down_alert_enabled`, `fall_down_reminder_call`, or
> `fall_down_level` are provided, the server also pushes the
> corresponding `FALLDOWN` and/or `LSSET` command to the device via
> TCP (if the device is currently connected).

```json
{
  "device_id": "DEVICE_UUID",
  "device_type": "android",
  "sms_alert_enabled": "1",
  "take_off_device_alert": "0",
  "safe_mode": "1",
  "talking_clock": "0",
  "night_power_saving": "0",
  "volume": 50,
  "brightness": 70,
  "fall_down_alert_enabled": true,
  "fall_down_reminder_call": true,
  "fall_down_level": 5
}
```

**Field notes:**

| Field                     | Type    | Description                                                              |
| ------------------------- | ------- | ------------------------------------------------------------------------ |
| `device_type`             | string  | `"android"` (default) or `"rtos"` — determines max fall-down sensitivity |
| `fall_down_alert_enabled` | boolean | Fall-down alarm alert switch (true = ON, false = OFF)                    |
| `fall_down_reminder_call` | boolean | Call center number after fall (true = ON, false = OFF)                   |
| `fall_down_level`         | number  | Sensitivity level: 1–6 (Android) or 1–8 (RT OS). 1 = most sensitive      |

---

## 7. Add Family Member

**POST** `/user/device/add_family_member`

```json
{
  "name": "Jane Doe",
  "mobile_no": "9876543210",
  "device_id": "DEVICE_UUID"
}
```

---

## 8. List Family Members

**POST** `/user/device/list_family_members`

```json
{
  "search": "",
  "page": 1,
  "sorting": "DESC",
  "limit": 10,
  "device_id": "DEVICE_UUID"
}
```

---

## 9. List Notifications

**POST** `/user/device/list_notifications`

```json
{
  "device_id": "DEVICE_UUID",
  "user_id": "USER_UUID",
  "type": "sos",
  "is_read": "0",
  "page": 1,
  "limit": 10,
  "sorting": "DESC",
  "start_date": "2026-08-01",
  "end_date": "2026-08-17"
}
```

---

## 10. Add Health Metrics

**POST** `/health/add_metrics`

```json
{
  "device_id": "DEVICE_UUID",
  "metric_type": "heart_rate",
  "value_primary": 72,
  "value_secondary": 120,
  "unit": "bpm"
}
```

---

## 11. Get Health Analytics

**POST** `/health/get_analytics`

```json
{
  "device_id": "DEVICE_UUID",
  "metric_type": "heart_rate",
  "range": "daily",
  "date": "2026-08-17"
}
```

---

## 12. Save / Update Geofence

**POST** `/user/device/save_geofence` (route not in userDeviceRoutes, check actual route)

```json
{
  "id": "GEOFENCE_UUID",
  "device_id": "DEVICE_UUID",
  "name": "Home",
  "latitude": 28.6139,
  "longitude": 77.209,
  "radius_meters": 100
}
```

---

## 13. List Geofences

**POST** `/user/device/list_geofences` (route not in userDeviceRoutes, check actual route)

```json
{
  "search": "",
  "page": 1,
  "sorting": "DESC",
  "limit": 10,
  "device_id": "DEVICE_UUID"
}
```

---

## 14. Toggle Geofence Status

**POST** `/user/device/toggle_geofence_status` (route not in userDeviceRoutes, check actual route)

```json
{
  "id": "GEOFENCE_UUID",
  "is_active": true
}
```

---

## 15. Create Emergency Contact

**POST** `/user/device/create_emergency_contact` (route not in userDeviceRoutes, check actual route)

```json
{
  "name": "Emergency Contact",
  "country_code": "+91",
  "phone_number": "9876543210",
  "device_id": "DEVICE_UUID"
}
```

---

## 16. Update Emergency Contact

**POST** `/user/device/update_emergency_contact` (route not in userDeviceRoutes, check actual route)

```json
{
  "id": "CONTACT_UUID",
  "name": "Emergency Contact",
  "country_code": "+91",
  "phone_number": "9876543210",
  "device_id": "DEVICE_UUID"
}
```

---

## 17. List Emergency Contacts

**POST** `/user/device/list_emergency_contacts` (route not in userDeviceRoutes, check actual route)

```json
{
  "search": "",
  "page": 1,
  "sorting": "DESC",
  "limit": 10,
  "device_id": "DEVICE_UUID"
}
```

---

## 18. Get Device Status

Sends a TS (terminal status) command to the device via TCP to request
fresh firmware/software status, then returns the current device data
from the database. When the device responds, the TCP server
automatically updates the record.

**POST** `/user/device/get_device_status`

```json
{
  "device_id": "DEVICE_UUID"
}
```

**Response fields:**

| Field                        | Type    | Description                                                            |
| ---------------------------- | ------- | ---------------------------------------------------------------------- |
| `device_id`                  | string  | Device UUID                                                            |
| `device_name`                | string  | Device name                                                            |
| `serial_number`              | string  | Protocol serial number                                                 |
| `imei`                       | string  | Device IMEI                                                            |
| `sim_card_number`            | string  | SIM card phone number                                                  |
| `firmware_version`           | string  | Firmware version (e.g. `G4C_YSC_EMMC_240_5M_En_N_2023.11.10_15.38.00`) |
| `is_online`                  | boolean | Whether device is currently connected via TCP                          |
| `connection_status`          | string  | `"online"` or `"offline"`                                              |
| `network_type`               | string  | e.g. `2G`, `4G`, `5G`                                                  |
| `network_carrier`            | string  | Carrier name                                                           |
| `signal_status`              | string  | Network signal status (e.g. `OK(100)`)                                 |
| `network_status`             | string  | Network status from device (e.g. `OK(100)`)                            |
| `gprs_enabled`               | boolean | Whether GPRS is enabled                                                |
| `gps_strength`               | string  | GPS strength (`strong` / `weak`)                                       |
| `gps_status`                 | string  | GPS status from device (e.g. `OK(0)`)                                  |
| `wifi_enabled`               | boolean | Whether WiFi is enabled                                                |
| `wifi_connected`             | boolean | Whether WiFi is connected                                              |
| `battery_percentage`         | number  | Battery level (0-100)                                                  |
| `location_interval_minutes`  | number  | Upload interval in minutes                                             |
| `heartbeat_interval_seconds` | number  | Heartbeat/link interval in seconds                                     |
| `language`                   | string  | Device language (e.g. `en`)                                            |
| `timezone`                   | string  | Device timezone (e.g. `+01:00`)                                        |
| `scene_mode`                 | number  | Current scene mode (1-4)                                               |
| `scene_mode_description`     | string  | Human-readable scene mode                                              |
| `last_updated_at`            | string  | Last update timestamp                                                  |
| `command_sent`               | boolean | Whether the TS command was sent to the device                          |
| `command_message`            | string  | Status message about the command                                       |

---

## 19. Restart Device

Sends a RESET (restart) command to the device via TCP. The device will
restart and, upon coming back online, will re-establish its TCP connection
and resume sending heartbeats.

**POST** `/user/device/restart_device`

```json
{
  "serial_number": "5678901234"
}
```

**Response fields:**

| Field             | Type    | Description                                      |
| ----------------- | ------- | ------------------------------------------------ |
| `serial_number`   | string  | Device serial number (protocol ID)               |
| `device_id`       | string  | Device UUID in the database                      |
| `device_name`     | string  | Device name                                      |
| `command_sent`    | boolean | Whether the RESET command was sent to the device |
| `command_message` | string  | Status message about the command                 |
| `timestamp`       | string  | ISO timestamp of when the command was sent       |

---

## 20. Device Command (Unified API)

Send various commands to the device via TCP. Use the `command` field to specify
the action:

- `1` = Restart (sends `[3G*YYYYYYYYYY*0005*RESET]`)
- `2` = Shutdown (sends `[CS*YYYYYYYYYY*0008*POWEROFF]`)
- `3` = Factory Reset (sends `[CS*YYYYYYYYYY*0007*FACTORY]`)

**POST** `/user/device/device_command`

```json
{
  "serial_number": "5678901234",
  "command": 1
}
```

**Response fields:**

| Field              | Type    | Description                                     |
| ------------------ | ------- | ----------------------------------------------- |
| `serial_number`    | string  | Device serial number (protocol ID)              |
| `device_id`        | string  | Device UUID in the database                     |
| `device_name`      | string  | Device name                                     |
| `command`          | number  | Command type (1=restart, 2=shutdown, 3=factory) |
| `command_name`     | string  | Human-readable command name                     |
| `command_sent`     | boolean | Whether the command was sent to the device      |
| `command_message`  | string  | Status message about the command                |
| `command_protocol` | string  | The actual protocol command sent to the device  |
| `timestamp`        | string  | ISO timestamp of when the command was sent      |

---

## 21. Find My Device

Send a FIND command to the device via TCP. The device will respond with its
location or an audible alert to help locate it.

Protocol: `[CS*YYYYYYYYYY*0004*FIND]`

**POST** `/user/device/find_device`

```json
{
  "serial_number": "5678901234"
}
```

**Response fields:**

| Field              | Type    | Description                                                         |
| ------------------ | ------- | ------------------------------------------------------------------- |
| `serial_number`    | string  | Device serial number (protocol ID)                                  |
| `device_id`        | string  | Device UUID in the database                                         |
| `device_name`      | string  | Device name                                                         |
| `command_sent`     | boolean | Whether the FIND command was sent to the device                     |
| `command_message`  | string  | Status message about the command                                    |
| `command_protocol` | string  | The actual protocol command sent (e.g. `[CS*5678901234*0004*FIND]`) |
| `timestamp`        | string  | ISO timestamp of when the command was sent                          |

---

## 22. Set Alarm Clock

Send alarm clock settings to the device via TCP. You can set up to 3 alarms.

Alarm format: `HH:MM-type-repeat` or `HH:MM-type-repeat-days`

- `HH:MM`: Time in 24-hour format (e.g., `08:10`)
- `type`: Alarm type (1=once, 2=daily, 3=weekly)
- `repeat`: Repeat count
- `days`: Days of week (7 chars, 0=Sun, 1=Mon, etc.) e.g., `0111110` = Mon-Fri

Protocol: `[CS*YYYYYYYYYY*LEN*REMIND,alarm1,alarm2,alarm3]`

**POST** `/user/device/set_alarm`

```json
{
  "serial_number": "5678901234",
  "alarms": ["08:10-1-1", "08:10-1-2", "08:10-1-3-0111110"]
}
```

**Response fields:**

| Field              | Type    | Description                                       |
| ------------------ | ------- | ------------------------------------------------- |
| `serial_number`    | string  | Device serial number (protocol ID)                |
| `device_id`        | string  | Device UUID in the database                       |
| `device_name`      | string  | Device name                                       |
| `alarms`           | array   | Array of alarm strings sent                       |
| `alarm_count`      | number  | Number of alarms set                              |
| `command_sent`     | boolean | Whether the REMIND command was sent to the device |
| `command_message`  | string  | Status message about the command                  |
| `command_protocol` | string  | The actual protocol command sent                  |
| `timestamp`        | string  | ISO timestamp of when the command was sent        |

---

## 23. Remote Snapshot (Capture Photo)

Send a remote snapshot command to the device via TCP. The device will capture
a photo and send it back as image data.

Protocol: `[CS*YYYYYYYYYY*0008*rcapture]`

**Device response format:**
`[3G*YYYYYYYYYY*len*img,x,y,z]`

- `x`: Image type (5 = remote snapshot)
- `y`: Timestamp (YYMMDDHHmmss format, e.g., 160429110950)
- `z`: Image data in hex format (automatically converted and saved as JPEG)

**POST** `/user/device/capture_snapshot`

```json
{
  "serial_number": "8800000015"
}
```

**Response fields:**

| Field              | Type    | Description                                                             |
| ------------------ | ------- | ----------------------------------------------------------------------- |
| `serial_number`    | string  | Device serial number (protocol ID)                                      |
| `device_id`        | string  | Device UUID in the database                                             |
| `device_name`      | string  | Device name                                                             |
| `command_sent`     | boolean | Whether the rcapture command was sent                                   |
| `command_message`  | string  | Status message about the command                                        |
| `command_protocol` | string  | The actual protocol command sent (e.g. `[CS*8800000015*0008*rcapture]`) |
| `note`             | string  | Information about the device response                                   |
| `timestamp`        | string  | ISO timestamp of when the command was sent                              |

**Note:** The image will be automatically saved to `./uploads/snapshots/` directory
and a snapshot record will be created in the database when the device responds.

---

## 24. Save Emergency Contacts (Bulk)

Push up to 3 SOS contacts (one per priority slot) to the device in a single call.

The server will:

1. Upsert each contact in the DB keyed by `(device_id, priority)`.
2. Re-read all stored contacts for the device and push them all to the watch
   in priority order: `priority=1` → `SOS1`, `priority=2` → `SOS2`,
   `priority=3` → `SOS3`. Empty slots are NOT sent.

Protocol sent to the watch (per slot):
`[3G*<serial>*LEN*SOS<slot>,<countryCode+phone>]`

Device reply (per slot):
`[3G*<serial>*0002*SOS<slot>]` (echo only)

> Tip: leave `id` as `""` to create, pass an existing UUID to update that row.

**POST** `/emergency_contact/save_contacts`

```json
{
  "serial_number": "8800000015",
  "contacts": [
    { "id": "", "name": "Mom", "phone_number": "9691905903", "priority": 1 },
    { "id": "", "name": "Dad", "phone_number": "9510589322", "priority": 2 },
    { "id": "", "name": "Sister", "phone_number": "9587374638", "priority": 3 }
  ]
}
```

**Response fields:**

| Field               | Type   | Description                                                                        |
| ------------------- | ------ | ---------------------------------------------------------------------------------- |
| `device`            | object | `{ id, serial_number, device_name }`                                               |
| `db_results`        | array  | Per-contact DB rows: `{ id, created, priority, name, phone_number, country_code }` |
| `sync.online`       | bool   | Whether the device was reachable on TCP                                            |
| `sync.wire_results` | array  | Per-slot packets actually sent: `{ slot, priority, name, digits, sent, protocol }` |
| `command_message`   | string | Human-readable summary                                                             |
| `timestamp`         | string | ISO timestamp                                                                      |

---

## 25. Save / Update Single Emergency Contact

Create or update ONE contact. After saving, the server re-syncs **all** stored
contacts to the device in priority order.

**POST** `/emergency_contact/save_contact`

### Body — create by `(device_id, priority)`:

```json
{
  "device_id": "a1a4d02f-48df-4ec7-b368-a84d1cd3f01c",
  "name": "Mom",
  "phone_number": "9691905903",
  "priority": 1
}
```

### Body — update by `id`:

```json
{
  "id": "CONTACT_UUID",
  "name": "Mom",
  "phone_number": "9691905903"
}
```

**Response fields:** same as #23 — includes the upserted `contact` plus
`sync.wire_results` for what was actually pushed to the watch.

---

## 26. Delete Emergency Contact

Delete ONE contact by id. After deleting, the server re-syncs the **remaining**
contacts to the device in priority order.

**DELETE** `/emergency_contact/delete/<CONTACT_UUID>`

```json
{}
```

> No body required — id comes from the URL.

**Response fields:**

| Field               | Type    | Description                                                                |
| ------------------- | ------- | -------------------------------------------------------------------------- |
| `deleted`           | number  | Number of rows deleted (0 or 1)                                            |
| `contact`           | object  | The contact row that was just deleted                                      |
| `device`            | object  | `{ id, serial_number, device_name }` of the owning device                  |
| `sync.online`       | boolean | Whether the device was reachable on TCP                                    |
| `sync.wire_results` | array   | Remaining slots pushed: `{ slot, priority, name, digits, sent, protocol }` |
| `command_message`   | string  | Human-readable summary                                                     |

---

## 27. List Emergency Contacts

Paginated list of contacts for a device. Sorted by `priority ASC NULLS LAST`,
then `createdAt` (use `sorting` to flip).

**POST** `/emergency_contact/all`

```json
{
  "search": "",
  "page": 1,
  "sorting": "DESC",
  "limit": 10,
  "device_id": "a1a4d02f-48df-4ec7-b368-a84d1cd3f01c"
}
```

**Response fields:** `{ page, limit, total, rows: [{ id, name, device_id, country_code, phone_number, priority, createdAt }, …] }`

---

## 28. Get Emergency Contact by ID

Fetch a single contact.

**GET** `/emergency_contact/<CONTACT_UUID>`

```json
{}
```

> No body required — id comes from the URL.

---

## 29. Set Phonebook (PHBX)

Push up to 30 contacts onto the watch's phonebook. Each contact is sent
as a separate PHBX packet (one round-trip per entry).

Protocol sent to the watch (per entry):
`[3G*<serial>*LEN*PHBX,<index>,<name>,<digits>,<photoData>]`

Device reply (per entry):
`[3G*<serial>*0002*PHBX,<status>]` where `status: 1=success, 0=failure`

- `index`: phonebook slot on the watch, integer **1..30**, unique across the batch.
- `name`: contact name. The spec says "Unicode coding". This firmware
  interprets that as **each Unicode codepoint as 4 hex digits in
  big-endian** — so `Mom` goes on the wire as `4d006f006d00`. To
  switch to raw UTF-8, set `PHBX_NAME_ENCODING=utf8` in the server env
  and restart. Default is `hex`.
- `number`: phone number. Digits-only on the wire; country code `91` is
  auto-prepended for 10-digit Indian mobiles.
- `photo`: optional photo data (currently unused — pass `""`).

`LEN` is the **UTF-8 byte length** of the content (after `*`), expressed
as a 4-digit uppercase hex value. Using `Buffer.byteLength(content,
"utf8")` (not `content.length`) is critical for non-ASCII names.

**POST** `/emergency_contact/set_phonebook`

```json
{
  "serial_number": "7893267563",
  "contacts": [
    { "index": 1, "name": "Mom", "number": "9691905903" },
    { "index": 2, "name": "Dad", "number": "9510589322" },
    { "index": 3, "name": "Sister", "number": "9587374638", "photo": "" }
  ]
}
```

**Response fields:**

| Field             | Type    | Description                                                                          |
| ----------------- | ------- | ------------------------------------------------------------------------------------ |
| `serial_number`   | string  | Device serial number (protocol ID)                                                   |
| `device_id`       | string  | Device UUID                                                                          |
| `device_name`     | string  | Device name                                                                          |
| `command_sent`    | boolean | Whether all PHBX entries were written to the socket                                  |
| `count`           | number  | Number of entries pushed                                                             |
| `wire_results`    | array   | Per-entry result: `{ index, name, digits, sent, protocol }`                          |
| `db_results`      | array   | Per-entry DB upsert: `{ id, slot_index, name, phone_number, country_code, created }` |
| `command_message` | string  | Human-readable summary                                                               |
| `timestamp`       | string  | ISO timestamp                                                                        |

Each contact is also **upserted into the server-side `DevicePhonebooks`
table** (one row per `(device_id, slot_index)`) so the list endpoint
(`POST /emergency_contact/list_phonebook`) can return what's currently
queued for the watch.

---

## 30. Clear Phonebook Slot (PHBX with empty name AND empty number)

Clear a single phonebook slot on the watch. Per the latest protocol spec,
this firmware clears a slot by sending PHBX again at the same slot index
with EMPTY name AND EMPTY number fields. There is no separate DPHBX
command word on this firmware. Matching is by **slot index** (1..30),
not by phone number.

Protocol sent to the watch:
`[3G*<serial>*LEN*PHBX,<index>,,,]`

All three fields after the index (name, number, photo) are blank. The
firmware wipes the entire contact record at that slot. (Sending the old
number along with an empty name leaves the number in the slot — that
was the bug we just fixed.)

Device reply (uses the same PHBX command word):
`[3G*<serial>*0004*PHBX]` (bare ack = success) or
`[3G*<serial>*0006*PHBX,<status>]` where `status: 1=success, 0=failure`

- `index` (required, integer 1..30): the watch's phonebook slot to clear.
- `number` (optional, accepted but NOT sent on the wire): the phone
  number that was in the slot. We accept it for caller convenience but
  do not transmit it because this firmware keeps the previous number
  if a number is provided. Digits-only with country code recommended
  (e.g. `919691905903` for `+91 96919 05903`). 10-digit Indian numbers
  are auto-prefixed with `91`.

**POST** `/emergency_contact/delete_phonebook`

```json
{
  "serial_number": "7893267563",
  "index": 1,
  "number": "919691905903"
}
```

**Response fields:**

| Field             | Type    | Description                                                   |
| ----------------- | ------- | ------------------------------------------------------------- |
| `serial_number`   | string  | Device serial number (protocol ID)                            |
| `device_id`       | string  | Device UUID                                                   |
| `device_name`     | string  | Device name                                                   |
| `index`           | number  | Slot index that was cleared (1..30)                           |
| `number`          | string  | Digits-only phone number that was in the slot (informational) |
| `command_sent`    | boolean | Whether the PHBX clear-slot packet was written to the socket  |
| `protocol`        | string  | Exact packet sent (e.g. `[3G*7893267563*000B*PHBX,1,,,]`)     |
| `db.deleted_rows` | number  | How many rows were removed from the DevicePhonebooks mirror   |
| `command_message` | string  | Human-readable summary                                        |
| `timestamp`       | string  | ISO timestamp                                                 |

---

## 31. List Phonebook Entries (Server-Side Mirror)

List all phonebook entries currently stored on the server for a device.
The server mirrors the watch's PHBX state in a `DevicePhonebooks` table:
one row per `(device_id, slot_index)` (1..30). This endpoint reads that
table — it does NOT query the watch itself, so it works even when the
device is offline.

Pagination defaults to the watch's full slot count (30), which means a
default request returns the entire phonebook in a single page. Use the
`search` parameter to filter by name or number (LIKE on both columns).

**POST** `/emergency_contact/list_phonebook`

```json
{
  "serial_number": "7893267563",
  "search": "Mom",
  "page": 1,
  "limit": 30,
  "sorting": "ASC"
}
```

**Response fields:**

| Field                   | Type    | Description                                             |
| ----------------------- | ------- | ------------------------------------------------------- |
| `device.id`             | string  | Device UUID                                             |
| `device.serial_number`  | string  | Device serial number (protocol ID)                      |
| `device.device_name`    | string  | Device name                                             |
| `pagination.page`       | number  | Current page (1-based)                                  |
| `pagination.limit`      | number  | Page size (max 30, the watch's full slot count)         |
| `pagination.total`      | number  | Total rows for this device                              |
| `pagination.totalPages` | number  | Total pages                                             |
| `pagination.hasNext`    | boolean | True if there is a next page                            |
| `pagination.hasPrev`    | boolean | True if there is a previous page                        |
| `slots_used`            | number  | Number of slots currently filled (= `pagination.total`) |
| `slots_total`           | number  | Always 30 (the watch's phonebook capacity)              |
| `contacts[]`            | array   | List of contact rows (see below)                        |

Each `contacts[]` entry:

| Field            | Type    | Description                                                                |
| ---------------- | ------- | -------------------------------------------------------------------------- |
| `id`             | string  | UUID of the row                                                            |
| `device_id`      | string  | Device UUID                                                                |
| `slot_index`     | number  | Watch phonebook slot (1..30)                                               |
| `name`           | string  | Decoded UTF-8 contact name (e.g. `Mom`)                                    |
| `phone_number`   | string  | National number without country code (e.g. `9691905903`)                   |
| `country_code`   | string  | Country code without `+` (e.g. `91`) — empty string if none                |
| `digits`         | string  | Convenience: `country_code + phone_number`, as sent on the wire            |
| `display_number` | string  | Convenience: `+91 9691905903` style, ready for the UI                      |
| `has_photo`      | boolean | True if a photo blob is attached                                           |
| `photo`          | string  | Opaque photo blob (hex or base64), or `null` if none                       |
| `createdAt`      | string  | ISO timestamp of when the row was first created                            |
| `updatedAt`      | string  | ISO timestamp of when the row was last updated (every set call bumps this) |

---

## 32. Fall-Down Alarm Alert (FALLDOWN)

Toggle the watch's fall-down alarm alert switch and the "call center
number after fall" switch.

**POST** `/user/device/fall_down_alert`

Wire protocol:

- Server send: `[3G*<id>*<LEN>*FALLDOWN,X,Y]`
  - `X` = fall-down alarm alert switch (1 = ON, 0 = OFF)
  - `Y` = call center number after fall (1 = ON, 0 = OFF)
- Device reply: `[3G*<id>*<LEN>*FALLDOWN]` (bare ack = success)

```json
{
  "serial_number": "8800000015",
  "alert_enabled": true,
  "call_center": true
}
```

**Response fields:**

| Field              | Type    | Description                                            |
| ------------------ | ------- | ------------------------------------------------------ |
| `serial_number`    | string  | Device serial number (protocol ID)                     |
| `device_id`        | string  | Device UUID                                            |
| `device_name`      | string  | Device name                                            |
| `alert_enabled`    | boolean | Fall-down alarm alert switch (true = ON, false = OFF)  |
| `call_center`      | boolean | Call center number after fall (true = ON, false = OFF) |
| `command_sent`     | boolean | Whether the TCP command was sent                       |
| `command_protocol` | string  | The on-wire protocol string that was sent              |

---

## 33. Fall-Down Sensitivity (LSSET)

Set the watch's fall-down detection sensitivity level.

**POST** `/user/device/fall_down_sensitivity`

Wire protocol:

- Server send: `[3G*<id>*<LEN>*LSSET,X+6]` (Android, 1–6 levels)
- Server send: `[3G*<id>*<LEN>*LSSET,X+8]` (RT OS, 1–8 levels)
  - `X` = current sensitivity level (1 = most sensitive)
  - `6` or `8` = total sensitivity levels (based on device OS)
- Device reply: `[3G*<id>*<LEN>*LSSET,X]` (X = current level)

> **TIP:** Android devices use 1–6 (server default 4 or 5).
> RT OS devices use 1–8 (server default 5 or 6).

```json
{
  "serial_number": "8800000015",
  "level": 5,
  "device_type": "android"
}
```

**Response fields:**

| Field              | Type    | Description                                                 |
| ------------------ | ------- | ----------------------------------------------------------- |
| `serial_number`    | string  | Device serial number (protocol ID)                          |
| `device_id`        | string  | Device UUID                                                 |
| `device_name`      | string  | Device name                                                 |
| `level`            | number  | Sensitivity level (1 = most sensitive)                      |
| `max_level`        | number  | Total levels for the device OS (6 for Android, 8 for RT OS) |
| `device_type`      | string  | `"android"` or `"rt_os"`                                    |
| `command_sent`     | boolean | Whether the TCP command was sent                            |
| `command_protocol` | string  | The on-wire protocol string that was sent                   |

---

## Notes

- Replace `DEVICE_UUID`, `USER_UUID`, `GEOFENCE_UUID`, `CONTACT_UUID` with actual IDs
- `type` valid values: `sos`, `geo_fence_out`, `geo_fence_in`, `low_battery`, `sim_remove`, `network`, `fall_detection`, `device_offline`, `general`
- `is_read` valid values: `"1"` (read) or `"0"` (unread)
- `metric_type` valid values: `heart_rate`, `blood_pressure`, `sleep`, `spo2`, `calories`, `temperature`, `distance`, `steps_daily`, `steps_cumulative`
- `range` valid values: `daily`, `weekly`, `monthly`
