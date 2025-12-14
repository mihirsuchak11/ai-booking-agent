
import { parseDateTime } from './src/services/businessRules';

// Mock types
interface MockResponse {
    status: number;
    data: any;
    headers: Record<string, string>;
}

// Mock request/response helpers
const createMockRes = (): any => {
    const res: any = {
        statusCode: 200,
        headers: {},
        data: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data: any) {
            this.data = data;
            return this;
        },
        send(data: any) {
            this.data = data;
            return this;
        },
        set(headers: Record<string, string>) {
            this.headers = { ...this.headers, ...headers };
            return this;
        },
        type(type: string) {
            this.headers['Content-Type'] = type;
            return this;
        }
    };
    return res;
};

async function runTests() {
    console.log('🚀 Starting Mock API Tests...\n');

    // Test 1: Date Parser Logic
    console.log('Test 1: Testing Date Parser (Business Rules)');
    const testDate = '2025-12-25';
    const testTime = '14:30';
    const parsed = parseDateTime(testDate, testTime);

    if (parsed && parsed.start.toISOString().includes('2025-12-25T14:30')) {
        console.log('✅ Date parsing successful');
    } else {
        console.error('❌ Date parsing failed:', parsed);
    }

    // Test 2: Verify specific files are gone (FileSystem check)
    console.log('\nTest 2: Verifying Cleanup');
    const fs = require('fs');
    const deletedFiles = [
        'src/services/calendar.ts',
        'src/services/deepgram-stt.ts',
        'src/services/deepgram-tts.ts',
        'src/routes/audio.ts'
    ];

    let allDeleted = true;
    for (const file of deletedFiles) {
        if (fs.existsSync(file)) {
            console.error(`❌ File still exists: ${file}`);
            allDeleted = false;
        } else {
            console.log(`✅ File confirmed deleted: ${file}`);
        }
    }

    if (allDeleted) {
        console.log('\n✨ All cleanup tests passed!');
    } else {
        console.error('\n⚠️  Some cleanup tests failed.');
        process.exit(1);
    }
}

runTests().catch(console.error);
