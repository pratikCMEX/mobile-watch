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

## Notes

- Replace `DEVICE_UUID`, `USER_UUID`, `GEOFENCE_UUID`, `CONTACT_UUID` with actual IDs
- `type` valid values: `sos`, `geo_fence_out`, `geo_fence_in`, `low_battery`, `sim_remove`, `network`, `fall_detection`, `device_offline`, `general`
- `is_read` valid values: `"1"` (read) or `"0"` (unread)
- `metric_type` valid values: `heart_rate`, `blood_pressure`, `sleep`, `spo2`, `calories`, `temperature`, `distance`, `steps_daily`, `steps_cumulative`
- `range` valid values: `daily`, `weekly`, `monthly`
