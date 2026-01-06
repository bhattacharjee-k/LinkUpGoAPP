#!/usr/bin/env node

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const testConfigs = {
  suggest: {
    url: `${BASE_URL}/api/suggest`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': process.env.TEST_COOKIE || '',
    },
    body: JSON.stringify({
      city: 'Chicago',
      categories: ['Drinks', 'Food'],
      budget: '$$',
      energy: 'Going out',
      timeWindow: 'Sat-Evening',
    }),
  },
  
  vote: {
    url: `${BASE_URL}/api/suggestions/__SUGGESTION_ID__/vote`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': process.env.TEST_COOKIE || '',
    },
    body: JSON.stringify({
      voteType: 'up',
    }),
  },
  
  getSessions: {
    url: `${BASE_URL}/api/sessions`,
    method: 'GET',
    headers: {
      'Cookie': process.env.TEST_COOKIE || '',
    },
  },
};

async function runTest(name, config, options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running load test: ${name}`);
  console.log(`URL: ${config.url}`);
  console.log(`Method: ${config.method}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const result = await autocannon({
    url: config.url,
    method: config.method,
    headers: config.headers,
    body: config.body,
    connections: options.connections || 10,
    duration: options.duration || 10,
    pipelining: options.pipelining || 1,
    timeout: options.timeout || 30,
  });
  
  return result;
}

function printResults(name, result) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Results for: ${name}`);
  console.log(`${'─'.repeat(60)}`);
  
  const latency = result.latency || {};
  const requests = result.requests || {};
  
  console.log('\nLatency (ms):');
  console.log(`  Average:  ${(latency.average || 0).toFixed(2)}`);
  console.log(`  p50:      ${(latency.p50 || 0).toFixed(2)}`);
  console.log(`  p95:      ${(latency.p95 || 0).toFixed(2)}`);
  console.log(`  p99:      ${(latency.p99 || 0).toFixed(2)}`);
  console.log(`  Max:      ${(latency.max || 0).toFixed(2)}`);
  
  console.log('\nThroughput:');
  console.log(`  Requests/sec: ${(requests.average || 0).toFixed(2)}`);
  console.log(`  Total:        ${requests.total || 0}`);
  
  console.log('\nErrors:');
  console.log(`  Total:     ${result.errors || 0}`);
  console.log(`  Timeouts:  ${result.timeouts || 0}`);
  
  const total = requests.total || 0;
  const errors = result.errors || 0;
  const errorRate = total > 0 ? ((errors / total) * 100).toFixed(2) : '0.00';
  console.log(`  Error Rate: ${errorRate}%`);
  
  console.log('\nStatus Codes:');
  if (result['2xx']) console.log(`  2xx: ${result['2xx']}`);
  if (result['3xx']) console.log(`  3xx: ${result['3xx']}`);
  if (result['4xx']) console.log(`  4xx: ${result['4xx']}`);
  if (result['5xx']) console.log(`  5xx: ${result['5xx']}`);
  
  const p95 = latency.p95 || 0;
  const passed = p95 < 500 && parseFloat(errorRate) < 1;
  console.log(`\nStatus: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Threshold: p95 < 500ms, error rate < 1%`);
  
  if (result['4xx'] > 0) {
    console.log(`  Note: 4xx errors likely due to missing authentication`);
  }
  
  return {
    name,
    p95,
    avgLatency: latency.average || 0,
    rps: requests.average || 0,
    errorRate: parseFloat(errorRate),
    passed,
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║            VibeCheck Load Test Suite                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  const testCookie = process.env.TEST_COOKIE;
  if (!testCookie) {
    console.log('\n⚠️  WARNING: No TEST_COOKIE provided');
    console.log('   Some tests may fail with 401 Unauthorized');
    console.log('   Set TEST_COOKIE env var with a valid session cookie\n');
  }
  
  const results = [];
  
  try {
    const suggestResult = await runTest('POST /api/suggest', testConfigs.suggest, {
      connections: 5,
      duration: 15,
    });
    results.push(printResults('POST /api/suggest', suggestResult));
  } catch (err) {
    console.error('Suggest test failed:', err.message);
  }
  
  try {
    const sessionsResult = await runTest('GET /api/sessions', testConfigs.getSessions, {
      connections: 20,
      duration: 10,
    });
    results.push(printResults('GET /api/sessions', sessionsResult));
  } catch (err) {
    console.error('Sessions test failed:', err.message);
  }
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                     Summary                                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('Endpoint                 | p95 (ms) | Avg (ms) | RPS    | Errors | Status');
  console.log('─'.repeat(80));
  
  for (const r of results) {
    const name = r.name.padEnd(24);
    const p95 = r.p95.toFixed(0).padStart(8);
    const avg = r.avgLatency.toFixed(0).padStart(8);
    const rps = r.rps.toFixed(1).padStart(6);
    const errors = `${r.errorRate}%`.padStart(6);
    const status = r.passed ? '✅' : '❌';
    console.log(`${name} |${p95} |${avg} |${rps} |${errors} | ${status}`);
  }
  
  const allPassed = results.every(r => r.passed);
  console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Load test failed:', err);
    process.exit(1);
  });
}

module.exports = { runTest, printResults, testConfigs };
