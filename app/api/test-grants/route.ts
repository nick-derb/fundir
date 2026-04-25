import { NextResponse } from 'next/server';

export async function GET() {
  // Test 1: minimal search with no filters
  const res1 = await fetch('https://api.grants.gov/v1/api/search2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      oppStatuses: 'posted',
      rows: 5,
      startRecordNum: 0,
    }),
    cache: 'no-store',
  });

  const data1 = await res1.json();

  // Test 2: with keyword
  const res2 = await fetch('https://api.grants.gov/v1/api/search2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: 'youth',
      oppStatuses: 'posted',
      rows: 5,
      startRecordNum: 0,
    }),
    cache: 'no-store',
  });

  const data2 = await res2.json();

  return NextResponse.json({
    test1_status: res1.status,
    test1_keys: Object.keys(data1),
    test1_data_keys: data1.data ? Object.keys(data1.data) : 'no data key',
    test1_hit_count: data1.data?.hitCount ?? data1.data?.totalRecords ?? 'unknown',
    test1_first_hit_keys: data1.data?.oppHits?.[0] ? Object.keys(data1.data.oppHits[0]) : 'no hits',
    test1_raw_sample: JSON.stringify(data1).slice(0, 500),
    test2_status: res2.status,
    test2_hit_count: data2.data?.hitCount ?? data2.data?.totalRecords ?? 'unknown',
    test2_raw_sample: JSON.stringify(data2).slice(0, 500),
  });
}
