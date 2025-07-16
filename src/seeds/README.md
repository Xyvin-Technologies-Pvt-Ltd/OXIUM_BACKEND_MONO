# Database Seeds

This directory contains seed files for initializing the database with default data.

## Available Seeds

### Admin Seed (`adminSeed.js`)

Creates a default admin user and role for system access.

**Default Admin Credentials:**

- Email: `admin@goec.com`
- Password: `admin123`
- Role: Super Admin (with all permissions)

## Running Seeds

### Run All Seeds

```bash
npm run seed
```

### Run Only Admin Seed

```bash
npm run seed:admin
```

### Verify Admin Login

```bash
npm run verify:admin
```

### Run Seeds Directly

```bash
# Run all seeds
node src/seeds/index.js

# Run only admin seed
node src/seeds/adminSeed.js

# Verify admin login
node src/seeds/verifyAdmin.js
```

## Seed Details

### Admin Seed

The admin seed creates:

1. A default "Super Admin" role with all system permissions
2. A default admin user with the following details:
   - Name: Super Admin
   - Email: admin@goec.com
   - Password: admin123 (hashed)
   - Mobile: 9876543210
   - Designation: System Administrator
   - Status: Active

### Permissions Included

The Super Admin role includes all system permissions:

- Dashboard access
- Account management
- Asset management
- Charging network management
- CPO support
- CRM management
- Data management
- Logs access
- Notification management
- Reports access
- Settings management
- Tag management
- Tariff management
- Admin management
- Role management
- Admin activity monitoring

## Safety Features

- **Idempotent**: Seeds can be run multiple times safely
- **Duplicate Check**: Won't create duplicate admin users
- **Error Handling**: Proper error handling and logging
- **Database Connection**: Automatically connects to database

## Customization

To modify the default admin credentials, edit the `adminSeed.js` file and change:

- Email address
- Password
- Name and other details

## Troubleshooting

If seeds fail to run:

1. Ensure database connection is working
2. Check MongoDB connection string in environment variables
3. Verify all required models are properly imported
4. Check console logs for specific error messages
