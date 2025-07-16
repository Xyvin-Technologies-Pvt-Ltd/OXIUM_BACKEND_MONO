const Admin = require('../models/adminSchema');
const Role = require('../models/rolesSchema');
const { comparePassword } = require('../utils/hashPassword');

const verifyAdminLogin = async () => {
    try {
        console.log('🔍 Verifying admin login...');

        // Find the admin
        const admin = await Admin.findOne({ email: 'admin@goec.com' }).populate('role');

        if (!admin) {
            console.log('❌ Admin not found');
            return;
        }

        console.log('✅ Admin found:', admin.email);
        console.log('📋 Admin details:');
        console.log('   Name:', admin.name);
        console.log('   Designation:', admin.designation);
        console.log('   Mobile:', admin.mobile);
        console.log('   Status:', admin.status ? 'Active' : 'Inactive');
        console.log('   Role:', admin.role?.role_name);

        // Test password verification
        const testPassword = 'admin123';
        const isPasswordValid = await comparePassword(testPassword, admin.password);

        if (isPasswordValid) {
            console.log('✅ Password verification successful');
        } else {
            console.log('❌ Password verification failed');
        }

        // Show role permissions
        if (admin.role) {
            console.log('🔐 Role permissions count:', admin.role.permissions?.length || 0);
            console.log('📍 Location access:', admin.role.location_access);
        }

        console.log('🎉 Admin verification completed successfully!');

    } catch (error) {
        console.error('❌ Error verifying admin:', error);
        throw error;
    }
};

// Run verification if this file is executed directly
if (require.main === module) {
    // Connect to database
    const connectDB = require('../db');

    connectDB().then(() => {
        verifyAdminLogin()
            .then(() => {
                console.log('✅ Verification completed');
                process.exit(0);
            })
            .catch((error) => {
                console.error('❌ Verification failed:', error);
                process.exit(1);
            });
    });
}

module.exports = { verifyAdminLogin }; 