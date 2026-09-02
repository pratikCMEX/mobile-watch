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

## 5. Update Device Settings

**POST** `/user/device/update_device_settings`

```json
{
  "device_id": "DEVICE_UUID",
  "sms_alert_enabled": "1",
  "take_off_device_alert": "0",
  "safe_mode": "1",
  "talking_clock": "0",
  "night_power_saving": "0",
  "volume": 50,
  "brightness": 70,
  "fall_down_alert_enabled": "1",
  "fall_down_reminder_call": "1",
  "fall_down_level": 5
}
```

---

## 6. Add Family Member

**POST** `/user/device/add_family_member`

```json
{
  "name": "Jane Doe",
  "mobile_no": "9876543210",
  "device_id": "DEVICE_UUID"
}
```

---

## 7. List Family Members

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

## 8. List Notifications

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

## 9. Add Health Metrics

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

## 10. Get Health Analytics

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

## 11. Save / Update Geofence

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

## 12. List Geofences

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

## 13. Toggle Geofence Status

**POST** `/user/device/toggle_geofence_status` (route not in userDeviceRoutes, check actual route)

```json
{
  "id": "GEOFENCE_UUID",
  "is_active": true
}
```

---

## 14. Create Emergency Contact

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

## 15. Update Emergency Contact

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

## 16. List Emergency Contacts

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

## 17. Get Device Status

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

## 18. Restart Device

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

## 19. Device Command (Unified API)

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

## 20. Find My Device

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

## 21. Set Alarm Clock

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

## Notes

- Replace `DEVICE_UUID`, `USER_UUID`, `GEOFENCE_UUID`, `CONTACT_UUID` with actual IDs
- `type` valid values: `sos`, `geo_fence_out`, `geo_fence_in`, `low_battery`, `sim_remove`, `network`, `fall_detection`, `device_offline`, `general`
- `is_read` valid values: `"1"` (read) or `"0"` (unread)
- `metric_type` valid values: `heart_rate`, `blood_pressure`, `sleep`, `spo2`, `calories`, `temperature`, `distance`, `steps_daily`, `steps_cumulative`
- `range` valid values: `daily`, `weekly`, `monthly`
