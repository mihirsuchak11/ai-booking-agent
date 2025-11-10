require('dotenv').config();
const OpenAI = require('openai');

// Test OpenAI API connection
async function testOpenAI() {
  console.log('🧪 Testing OpenAI API Connection\n');
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is not set in environment variables');
    console.log('\nTo test locally, create a .env file with:');
    console.log('OPENAI_API_KEY=your-api-key-here\n');
    process.exit(1);
  }

  console.log('✅ OPENAI_API_KEY found');
  console.log(`   Key preview: ${process.env.OPENAI_API_KEY.substring(0, 7)}...${process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)}\n`);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    console.log('🔄 Testing API call...\n');
    
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Hello, API test successful!"' },
      ],
      max_tokens: 50,
    });

    const response = completion.choices[0]?.message?.content || '';
    
    console.log('✅ OpenAI API is working!');
    console.log(`📥 Response: ${response}\n`);
    
    console.log('📊 API Details:');
    console.log(`   Model: ${completion.model}`);
    console.log(`   Usage: ${completion.usage?.total_tokens || 'N/A'} tokens`);
    console.log(`   Finish reason: ${completion.choices[0]?.finish_reason || 'N/A'}\n`);
    
  } catch (error) {
    console.error('❌ OpenAI API Error:\n');
    console.error(`   Message: ${error.message}`);
    console.error(`   Status: ${error.status || 'N/A'}`);
    console.error(`   Code: ${error.code || 'N/A'}`);
    console.error(`   Type: ${error.type || 'N/A'}\n`);
    
    if (error.status === 401) {
      console.error('🔑 Issue: Invalid API key');
      console.error('   - Check that your API key is correct');
      console.error('   - Make sure there are no extra spaces');
      console.error('   - Verify the key is active in OpenAI dashboard\n');
    } else if (error.status === 429) {
      console.error('⏱️  Issue: Rate limit exceeded');
      console.error('   - You\'ve hit the rate limit');
      console.error('   - Wait a moment and try again\n');
    } else if (error.code === 'insufficient_quota') {
      console.error('💰 Issue: Insufficient quota');
      console.error('   - Your OpenAI account has no credits');
      console.error('   - Add credits at https://platform.openai.com/account/billing\n');
    } else {
      console.error('🔍 Full error:', error);
    }
    
    process.exit(1);
  }
}

testOpenAI();

