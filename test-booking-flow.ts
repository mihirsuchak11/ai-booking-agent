
import dotenv from 'dotenv';
import { resolveBusinessByPhoneNumber, loadBusinessConfig } from './src/db/business';
import { checkDbAvailability, createDbBooking } from './src/db/bookings';
import { parseDateTime } from './src/services/businessRules';
import { supabase } from './src/db/client';

dotenv.config();

async function verifyBookingFlow() {
    console.log('🚀 Starting Booking Flow Verification...');

    const testPhone = process.env.TWILIO_PHONE_NUMBER;
    if (!testPhone) {
        console.error('❌ TWILIO_PHONE_NUMBER not found in .env');
        process.exit(1);
    }

    console.log(`\n1️⃣  Resolving Business for phone: ${testPhone}`);
    const businessId = await resolveBusinessByPhoneNumber(testPhone);

    if (!businessId) {
        console.error('❌ Could not find business for this phone number.');
        console.error('   Hint: Ensure the phone number is in the "business_phone_numbers" table in Supabase.');
        process.exit(1);
    }
    console.log(`✅ Business Found ID: ${businessId}`);

    console.log(`\n2️⃣  Loading Business Config`);
    const businessConfig = await loadBusinessConfig(businessId);
    if (!businessConfig) {
        console.error('❌ Could not load business config.');
        process.exit(1);
    }
    console.log(`✅ Config Loaded: ${businessConfig.business.name}`);
    console.log('🔍 Working Hours:', JSON.stringify(businessConfig.config?.working_hours, null, 2));

    // Helpers
    const getNextBusinessDay = () => {
        const d = new Date();
        d.setDate(d.getDate() + 2); // 2 Days from now (to pass 24h notice)
        // Force 10:00 AM
        d.setHours(10, 0, 0, 0);
        return d;
    };

    const targetDate = getNextBusinessDay();
    // Format for parseDateTime: "YYYY-MM-DD", "HH:MM"
    const dateStr = targetDate.toISOString().split('T')[0];
    const timeStr = "10:00";

    console.log(`\n3️⃣  Parsing Date/Time: ${dateStr} ${timeStr}`);
    const dateTime = parseDateTime(dateStr, timeStr);

    if (!dateTime) {
        console.error('❌ parseDateTime returned null');
        process.exit(1);
    }
    console.log(`✅ Parsed: ${dateTime.start.toISOString()} to ${dateTime.end.toISOString()}`);

    console.log(`\n4️⃣  Checking Availability`);
    const availability = await checkDbAvailability(
        businessId,
        dateTime.start,
        dateTime.end,
        businessConfig.config
    );

    if (!availability.available) {
        console.log(`⚠️  Slot not available: ${availability.reason}`);
        console.log('   (This is a valid test result if the slot is actually blocked)');
        return;
    }
    console.log('✅ Slot is available');

    console.log(`\n5️⃣  Creating Test Booking`);
    const bookingId = await createDbBooking(
        businessId,
        null, // No call session for test
        "Test User (Verification Script)",
        "+15550000000",
        dateTime.start,
        dateTime.end
    );

    if (bookingId) {
        console.log(`✅ Booking Created Successfully! ID: ${bookingId}`);

        // Cleanup
        console.log(`\n6️⃣  Cleaning up (Deleting test booking)...`);
        const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
        if (error) {
            console.error('❌ Failed to delete test booking:', error.message);
        } else {
            console.log('✅ Test booking deleted.');
        }
    } else {
        console.error('❌ Failed to create booking.');
    }

    console.log('\n✨ Verification Complete!');
}

verifyBookingFlow().catch(console.error);
