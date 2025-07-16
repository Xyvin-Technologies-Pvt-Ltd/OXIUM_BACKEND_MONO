const mongoose = require('mongoose');
const Admin = require('../models/adminSchema');
const Role = require('../models/rolesSchema');
const { hashPassword } = require('../utils/hashPassword');

const seedAdmin = async () => {
    try {
        console.log('🌱 Starting admin seed...');

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: 'admin@goec.com' });
        if (existingAdmin) {
            console.log('✅ Admin already exists, skipping seed');
            return;
        }

        // Create default role
        const defaultRole = new Role({
            role_name: 'Super Admin',
            description: 'Default super admin role with all permissions',
            permissions: [
                'dashboard_view',
                'dashboard_modify',
                'accounts_view',
                'accounts_modify',
                'assetManagement_view',
                'assetManagement_modify',
                'chargingNetwork_view',
                'chargingNetwork_modify',
                'cpoSupport_view',
                'cpoSupport_modify',
                'crm_view',
                'crm_modify',
                'dataManagement_view',
                'dataManagement_modify',
                'logs_view',
                'logs_modify',
                'notification_view',
                'notification_modify',
                'reports_view',
                'reports_modify',
                'settings_view',
                'settings_modify',
                'tagManagement_view',
                'tagManagement_modify',
                'tariff_view',
                'tariff_modify',
                'adminManagement_view',
                'adminManagement_modify',
                'roleManagement_view',
                'roleManagement_modify',
                'adminActivity_view',
                'adminActivity_modify'
            ],
            location_access: ['all'],
            isActive: true
        });

        const savedRole = await defaultRole.save();
        console.log('✅ Default role created:', savedRole.role_name);

        // Hash password
        const hashedPassword = await hashPassword('admin123');

        // Create default admin
        const defaultAdmin = new Admin({
            name: 'Super Admin',
            designation: 'System Administrator',
            email: 'admin@goec.com',
            mobile: '9876543210',
            password: hashedPassword,
            role: savedRole._id,
            status: true
        });

        const savedAdmin = await defaultAdmin.save();
        console.log('✅ Default admin created:', savedAdmin.email);

        console.log('🎉 Admin seed completed successfully!');
        console.log('📧 Login credentials:');
        console.log('   Email: admin@goec.com');
        console.log('   Password: admin123');

    } catch (error) {
        console.error('❌ Error seeding admin:', error);
        throw error;
    }
};

// Run seed if this file is executed directly
if (require.main === module) {
    // Connect to database
    const connectDB = require('../db');

    connectDB().then(() => {
        seedAdmin()
            .then(() => {
                console.log('✅ Seed completed');
                process.exit(0);
            })
            .catch((error) => {
                console.error('❌ Seed failed:', error);
                process.exit(1);
            });
    });
}

module.exports = { seedAdmin }; 