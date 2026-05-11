/**
 * YMCA Metropolitan Chicago — Live Financial Data
 * Source: IRS Form 990 via Compensation990.com (FY2024)
 * EIN: 36-2179782  ·  Founded: 1858  ·  Chicago, IL
 *
 * FY2024 = fiscal year ended December 31, 2024
 */
import type { OrgMatchProfile } from './matching';

// ── Core Financials ──────────────────────────────────────────────────────────

export const YMCA_CORE = {
  fiscalYear:       2024,
  fiscalYearEnd:    '2024-12-31',
  ein:              '36-2179782',
  name:             'The YMCA of Metropolitan Chicago',
  city:             'Chicago',
  state:            'IL',
  founded:          1858,
  totalEmployees:   3_070,
  compensatedEmployeesReported: 15,

  // Top-line 990 figures
  revenue:              80_477_142,
  expenses:            104_531_689,
  employeeCompensation: 59_423_381,
  contractorCompensation: 7_051_990,
  netChange:           -24_054_547,  // deficit

  // Prior year for trend
  revenuePrior:   68_000_000,   // approximate FY2023
  expensesPrior:  94_000_000,   // approximate FY2023
} as const;

// ── Revenue History (from compensation990 chart) ──────────────────────────────

export const YMCA_REVENUE_HISTORY = [
  { year: 2016, revenue: 57_000_000, expenses: 56_000_000 },
  { year: 2017, revenue: 56_000_000, expenses: 56_500_000 },
  { year: 2018, revenue: 56_000_000, expenses: 57_000_000 },
  { year: 2019, revenue: 57_000_000, expenses: 58_000_000 },
  { year: 2020, revenue: 41_000_000, expenses: 48_000_000 },  // COVID
  { year: 2021, revenue: 32_000_000, expenses: 42_000_000 },  // COVID peak impact
  { year: 2022, revenue: 43_000_000, expenses: 52_000_000 },  // recovery
  { year: 2023, revenue: 68_000_000, expenses: 94_000_000 },  // recovery + expansion costs
  { year: 2024, revenue: 80_477_142, expenses: 104_531_689 }, // current
] as const;

// ── Leadership & Compensation (FY2024 Schedule J) ────────────────────────────

export const YMCA_LEADERSHIP = [
  {
    name:       'Dorri McWhorter',
    title:      'President and Chief Executive Officer',
    total:      512_507,
    fromOrg:    452_959,
    other:      59_548,
    vsLastYear: +0.6,
    isNew:      false,
  },
  {
    name:       'Anthony C Lloyd Sr',
    title:      'Executive VP and Chief Financial Officer',
    total:      353_473,
    fromOrg:    306_485,
    other:      46_988,
    vsLastYear: +3.5,
    isNew:      false,
  },
  {
    name:       'Swathi Staley',
    title:      'SVP, Chief Community Officer and Investment Officer, General Counsel',
    total:      255_927,
    fromOrg:    230_792,
    other:      25_135,
    vsLastYear: -3.2,
    isNew:      false,
  },
  {
    name:       'Andrew Adelmann',
    title:      'SVP, Chief Technology Officer',
    total:      247_784,
    fromOrg:    202_659,
    other:      45_125,
    vsLastYear: +0.9,
    isNew:      false,
  },
  {
    name:       'Jill Doerner',
    title:      'SVP, Chief Employee Empowerment Officer',
    total:      244_374,
    fromOrg:    213_316,
    other:      31_058,
    vsLastYear: -3.7,
    isNew:      false,
  },
  {
    name:       'Basil Fitzsimmons',
    title:      'VP, Real Estate and Facilities',
    total:      241_462,
    fromOrg:    195_210,
    other:      46_252,
    vsLastYear: -0.2,
    isNew:      false,
  },
  {
    name:       'Shannon Babcock',
    title:      'VP, Strategic Partnerships',
    total:      225_599,
    fromOrg:    183_243,
    other:      42_356,
    vsLastYear: +7.5,
    isNew:      false,
  },
  {
    name:       'Danette Connors',
    title:      'SVP, Chief Learning Officer',
    total:      219_285,
    fromOrg:    217_393,
    other:      1_892,
    vsLastYear: null,
    isNew:      true,
  },
  {
    name:       'Molly Silverman',
    title:      'SVP, Chief Growth/Engagement Officer',
    total:      218_569,
    fromOrg:    184_973,
    other:      33_596,
    vsLastYear: null,
    isNew:      true,
  },
  {
    name:       'Martina Hone',
    title:      'SVP, Chief Economic Growth/Engagement Officer',
    total:      202_092,
    fromOrg:    188_391,
    other:      13_701,
    vsLastYear: null,
    isNew:      true,
  },
  {
    name:       'Helen Townsend',
    title:      'VP of Accounting, Controller',
    total:      196_691,
    fromOrg:    165_070,
    other:      31_621,
    vsLastYear: +5.9,
    isNew:      false,
  },
  {
    name:       'Michael Ciminero',
    title:      'VP, Continuous Improvement and Internal Audit',
    total:      191_027,
    fromOrg:    160_908,
    other:      30_119,
    vsLastYear: -2.3,
    isNew:      false,
  },
] as const;

// ── Contractors (FY2024) ──────────────────────────────────────────────────────

export const YMCA_CONTRACTORS = [
  {
    name:       'Young Building Solutions LLC',
    category:   'Facility Support',
    amount:     2_650_511,
    vsLastYear: 0.0,
    isNew:      false,
  },
  {
    name:       'Stanton Mechanical Inc.',
    category:   'Mechanical Contracting',
    amount:     1_882_258,
    vsLastYear: null,
    isNew:      true,
  },
  {
    name:       'P4 Security Solutions',
    category:   'Security',
    amount:     998_515,
    vsLastYear: -36.4,
    isNew:      false,
  },
  {
    name:       'Childcare Careers',
    category:   'Child Care Staffing',
    amount:     844_739,
    vsLastYear: null,
    isNew:      true,
  },
  {
    name:       'Rmb Interiors Inc.',
    category:   'Space Design',
    amount:     675_967,
    vsLastYear: null,
    isNew:      true,
  },
] as const;

// ── Rankings ──────────────────────────────────────────────────────────────────

export const YMCA_RANKINGS = [
  { rank: 9,  category: 'Human Services', year: 2024 },
  { rank: 10, category: 'Human Services', year: 2024 },
  { rank: 12, category: 'Human Services', year: 2023 },
] as const;

// ── Intelligence Flags ────────────────────────────────────────────────────────

export const YMCA_INTELLIGENCE_FLAGS = [
  {
    severity:   'critical' as const,
    category:   'Financial Health',
    headline:   'Operating Deficit: ($24.1M) in FY2024',
    detail:     'The YMCA of Metropolitan Chicago reported revenue of $80.5M against expenses of $104.5M, resulting in a $24.1M net deficit. Expenses exceeded revenue by 30%. This deficit reflects ongoing post-COVID facility investments and expansion costs as the organization rebuilds membership and program revenue.',
    metric:     '($24.1M) deficit · expenses exceed revenue 30%',
    action:     'Prioritize grants that fund operating and program costs, not just capital. Look for unrestricted general operating grants from foundations with human services focus.',
  },
  {
    severity:   'critical' as const,
    category:   'Personnel Costs',
    headline:   'Employee Compensation = 57% of Revenue',
    detail:     'Employee compensation of $59.4M represents 57% of total revenue and 56.8% of total expenses. With 3,070 total employees and 15 reported compensated executives averaging $243,196 each, labor is the dominant cost driver. Average employee cost across all staff is approximately $19,359.',
    metric:     '$59.4M comp / $80.5M revenue = 57%',
    action:     'Target workforce development and human services grants that directly fund personnel. Grants that allow indirect cost recovery are particularly valuable.',
  },
  {
    severity:   'warning' as const,
    category:   'Revenue Recovery',
    headline:   'Revenue Still Below Pre-COVID Levels Adjusted for Scale',
    detail:     'Pre-COVID (FY2019) revenue was ~$57M. FY2024 shows $80.5M — seemingly higher, but expenses have grown to $104M. The organization has expanded programs and facilities significantly while membership and program revenue have not fully recovered. The gap between revenue and cost structure is the core challenge.',
    metric:     'Revenue +41% vs 2019 · Expenses +83% vs 2019',
    action:     'Grants that support membership access programs (sliding scale fees, scholarship support) directly address revenue recovery by enabling more full-paying members.',
  },
  {
    severity:   'warning' as const,
    category:   'Contractor Spend',
    headline:   '$7.1M in Contractor Compensation — 3 of 5 Are New in 2024',
    detail:     'YMCA spent $7.1M on contractors in FY2024 (up 4.2% from 2023). Three of the five reported contractors are new in 2024: Stanton Mechanical ($1.9M), Childcare Careers ($844K), and Rmb Interiors ($676K). P4 Security dropped 36.4%. High contractor turnover suggests shifting facility and operational strategy.',
    metric:     '$7.05M / 3 new vendors in 2024',
    action:     'Childcare Careers at $844K signals contracted child care staffing — a grant opportunity for workforce development in child care sector.',
  },
  {
    severity:   'info' as const,
    category:   'Rankings',
    headline:   'Ranked #9 and #10 in Human Services (2024)',
    detail:     'The YMCA of Metropolitan Chicago holds two top-10 rankings in the Human Services category (2024), reflecting its size and reach. A third ranking at #12 was held in 2023. These rankings are based on total compensation reported, indicating the organization is among the largest nonprofits in Chicago by workforce.',
    metric:     '#9, #10 Human Services · 3,070 employees',
    action:     'Use ranking data in grant applications as evidence of organizational scale and capacity to manage large grants effectively.',
  },
  {
    severity:   'info' as const,
    category:   'Executive Team',
    headline:   '3 New Senior VPs Added in FY2024',
    detail:     'Three new SVP-level positions were created in FY2024: Chief Learning Officer (Danette Connors, $219K), Chief Growth/Engagement Officer (Molly Silverman, $219K), and Chief Economic Growth Officer (Martina Hone, $202K). This signals organizational investment in growth, learning, and community engagement leadership.',
    metric:     '3 new SVPs · Total new comp: $640K',
    action:     'New Learning and Growth leadership signals readiness for program expansion grants. Position grant asks around organizational capacity building.',
  },
  {
    severity:   'info' as const,
    category:   'Leadership Compensation',
    headline:   'CEO Compensation: $512,507 — Appropriate for Scale',
    detail:     'CEO Dorri McWhorter earned $512,507 in FY2024 (+0.6% from 2023). For an organization with 3,070 employees and $80M+ in revenue, this is within the normal range for major city YMCAs. The 15 reported compensated employees average $243,196, with the highest earner at $512K.',
    metric:     'CEO $512K · Avg reported: $243K · 15 disclosed',
    action:     'CEO compensation within reasonable range for grants with overhead scrutiny. Program-to-admin ratio and deficit are the more significant concerns to address in grant applications.',
  },
] as const;

// ── Match Profile (used by discovery scoring engine) ─────────────────────────

export const YMCA_MATCH_PROFILE: OrgMatchProfile = {
  name:             'The YMCA of Metropolitan Chicago',
  mission:          'The YMCA of Metropolitan Chicago strengthens communities through youth development, healthy living, and social responsibility. Serving Chicago since 1858, the Y provides programs and services for all ages — from early childhood and afterschool programs to workforce development, fitness, and family support.',
  city:             'Chicago',
  state:            'IL',
  annualBudget:     YMCA_CORE.revenue,
  sites:            20,
  gataRegistered:   true,
  orgGrantMin:      100_000,
  orgGrantMax:      5_000_000,
  targetPopulations: [
    'youth', 'children', 'teens', 'families', 'adults', 'seniors',
    'low-income', 'underserved communities', 'workforce', 'child care',
  ],
  programs: [
    {
      name:  'Youth Development',
      areas: ['youth', 'afterschool', 'child care', 'early childhood', 'teen programs', 'mentoring', 'summer camp', 'out-of-school time', 'social-emotional learning'],
    },
    {
      name:  'Healthy Living',
      areas: ['fitness', 'wellness', 'health', 'swimming', 'sports', 'recreation', 'chronic disease prevention', 'nutrition'],
    },
    {
      name:  'Social Responsibility',
      areas: ['workforce development', 'job training', 'social services', 'community programs', 'financial wellness', 'civic engagement', 'violence prevention'],
    },
  ],
  historicalWinRates: {},
};
