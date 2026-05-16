/**
 * CYC Live Data — sourced from FY2025 Audited Financial Statements
 * (Year ended June 30, 2025 · Audit issued January 5, 2026)
 * + Chicago Youth Centers public website / 990 filing
 *
 * This is the single source of truth for CYC financial intelligence.
 * Updated from: chicagoyouthcenters.org/nonprofit-status-financial-info
 */

import type { ComputedFinancials, OrgProfile, Filing990 } from './propublica';

// ── Statement of Financial Position ─────────────────────────────────────────

export const CYC_BALANCE_SHEET = {
  asOfDate: '2025-06-30',
  priorDate: '2024-06-30',
  assets: {
    cash:                    1_793_703,
    cashPrior:               1_742_064,
    accountsReceivableGovt:  1_641_796,
    accountsReceivableOther:   134_410,
    prepaidExpenses:            55_355,
    pledgesReceivableNet:      897_324,
    investments:             5_875_844,
    investmentsPrior:        5_666_921,
    realEstateHeldForSale:     155_089,  // Elliott Donnelley YMCA
    propertyEquipmentNet:    6_114_278,
    rightOfUseOperating:     1_416_920,
    rightOfUseFinance:           2_724,
    totalAssets:            18_087_443,
    totalAssetsPrior:       18_685_475,
  },
  liabilities: {
    accountsPayable:           764_652,
    accruedPayroll:            247_387,
    deferredRevenue:            65_625,
    lineOfCredit:              455_000,   // BMO Harris, drawn FY2025 (was $0 FY2024)
    leaseLiabilityOperating: 1_502_369,
    leaseLiabilityFinance:       2_948,
    totalLiabilities:        3_039_972,
    totalLiabilitiesPrior:   2_728_465,
  },
  netAssets: {
    // Without donor restrictions
    unrestrictedUndesignated: 1_878_194,
    boardDesignatedInvestment:  737_520,
    investedInPropertyEquip:  6_186_153,
    totalWithoutRestriction:  8_801_867,
    totalWithoutRestrictionPrior: 9_414_752,
    // With donor restrictions
    timePurposeRestricted:    1_561_081,
    endowmentFund:            4_684_523,
    totalWithRestriction:     6_245_604,
    totalWithRestrictionPrior: 6_542_258,
    // Total
    totalNetAssets:          15_047_471,
    totalNetAssetsPrior:     15_957_010,
  },
} as const;

// ── Statement of Activities ──────────────────────────────────────────────────

export const CYC_INCOME_STATEMENT = {
  fiscalYear: 2025,
  fiscalYearEnd: '2025-06-30',

  revenue: {
    // Public Support
    contributionsCash:        1_595_629,
    contributionsCashPrior:   2_804_171,
    contributionsInKind:         87_273,
    specialEventsNet:           653_577,   // net of $213,728 direct costs
    totalPublicSupport:       2_336_479,

    // Direct Program Revenue
    governmentFeesGrants:     9_998_206,
    governmentFeesGrantsPrior: 9_922_229,
    programServiceFees:         336_741,
    contractualRevenue:           2_987,
    totalDirectProgram:      10_337_934,

    // Other
    investmentReturnNet:        158_004,
    realizedGains:              329_462,
    unrealizedGains:            226_309,
    miscellaneous:               15_600,
    gainOnAssetSale:              1_500,
    totalOther:                 730_875,

    // Grand total
    totalRevenue:            13_405_288,
    totalRevenuePrior:       14_893_766,
  },

  expenses: {
    // By Program
    earlyChildhoodEducation:  8_661_254,
    earlyChildhoodPrior:      7_902_978,
    schoolAgeChildDev:        2_224_572,
    schoolAgePrior:           2_180_577,
    teenLeadershipDev:        1_426_797,
    teenPrior:                1_616_851,
    totalProgramServices:    12_312_623,
    totalProgramPrior:       11_700_406,

    // Supporting
    managementGeneral:        1_507_479,
    developmentFundraising:     494_725,
    totalSupporting:          2_002_204,

    // Grand total
    totalExpenses:           14_314_827,
    totalExpensesPrior:      13_876_754,
  },

  netChange:          -909_539,     // OPERATING DEFICIT
  netChangePrior:    1_017_012,     // Was a surplus in FY2024
} as const;

// ── Liquidity & Availability (Note 2) ────────────────────────────────────────

export const CYC_LIQUIDITY = {
  grossFinancialAssets:      10_343_077,
  unavailableWithinOneYear:  -6_474_293,   // endowment + restricted + board-designated
  availableForGeneralUse:     3_868_784,   // 12-month liquidity window
  outstandingObligations:    -1_012_039,
  netUnrestrictedLiquidity:   2_856_745,   // ~2.4 months of operating expenses
  // Derived
  monthsOfLiquidity:            2.4,       // $2.86M / ($14.3M / 12)
  lineOfCreditAvailable:      1_045_000,   // $1.5M limit - $455K drawn
  unconditionalGrantPipeline: 4_252_574,   // unrecognized conditional govt grants
} as const;

// ── Capital Campaign ──────────────────────────────────────────────────────────

export const CYC_CAPITAL_CAMPAIGN = {
  name: '"Imagine the Possibilities" Campaign',
  goal:           8_200_000,
  pledgesInBook:    966_341,   // gross pledges receivable as of 6/30/2025
  releasedToDate:   575_679,   // released to income in FY2025
  // Multi-year pledge schedule
  pledgeDueDates: [
    { year: 'FY2026', amount: 341_341 },
    { year: 'FY2027', amount: 235_500 },
    { year: 'FY2028', amount: 118_000 },
    { year: 'FY2029', amount:  17_000 },
    { year: 'FY2030', amount:   4_500 },
  ],
  boardPledgesIncluded:  250_341,
  conditionalPromise:    150_000,   // unrecognized conditional
} as const;

// ── Federal Funding Risk (from CYC profile + financials) ─────────────────────

export const CYC_FEDERAL_PROGRAMS = [
  {
    name:         'Head Start / Early Head Start',
    aln:          '93.600',
    estimatedAmount: 8_287_000,  // estimated from Early Childhood govt revenue
    pctOfRevenue:   61.8,        // 8.287M / 13.405M
    risk:         'critical' as const,
    riskReason:   '5 of 10 HHS regional offices closed; payment delays reported; FY2026 level-funded; inflation erosion',
    programImpact: 'Early Childhood Education — 70% of total program expenses',
  },
  {
    name:         '21st Century Community Learning Centers',
    aln:          '84.287',
    estimatedAmount: 1_159_000,
    pctOfRevenue:   8.6,
    risk:         'critical' as const,
    riskReason:   'FY2026 and FY2027 budgets proposed complete elimination; $6.8B frozen July 2025; Congress restored but signal is clear',
    programImpact: 'School Age Child Development / afterschool programs',
  },
  {
    name:         'Child & Adult Care Food Program',
    aln:          '10.558',
    estimatedAmount: 661_000,
    pctOfRevenue:   4.9,
    risk:         'moderate' as const,
    riskReason:   'Nutrition program spending under scrutiny; not directly targeted but broader cuts possible',
    programImpact: 'Early Childhood meal programs',
  },
  {
    name:         'HUD / Out-of-School Time',
    aln:          '14.881',
    estimatedAmount: 216_000,
    pctOfRevenue:   1.6,
    risk:         'moderate' as const,
    riskReason:   'HUD operational disruptions; moving-to-work program adjustments',
    programImpact: 'Select afterschool sites',
  },
] as const;

// ── Endowment ─────────────────────────────────────────────────────────────────

export const CYC_ENDOWMENT = {
  totalEndowment:         5_422_043,
  donorRestricted:        4_684_523,
  boardDesignated:          737_520,
  priorYearTotal:         5_019_445,
  investmentReturnFY2025:   460_198,
  expenditures:            -68_156,
  spendingPolicyPct:           5.0,    // 5% of 8-quarter average
  // Named endowments
  namedFunds: [
    { name: 'Camp programs',                   amount: 1_232_525 },
    { name: 'Sidney Epstein Center maintenance', amount: 500_000 },
    { name: 'Rebecca Crown Center operations', amount: 325_000 },
    { name: 'Art scholarships & programs',      amount: 30_501 },
    { name: 'Scholarships',                     amount: 127_912 },
    { name: 'General operations',               amount: 625_801 },
    { name: 'Accumulated earnings',             amount: 1_842_784 },
  ],
} as const;

// ── Leadership Team ───────────────────────────────────────────────────────────

export const CYC_LEADERSHIP = [
  {
    name:        'Tina Ayala',
    title:       'President & CEO',
    tenure:      30,   // years at CYC
    salary:      157_401,
    bio:         'Joined CYC as a Social Work Intern from Loyola University. Rose through: Youth Worker → Lead Youth Worker → Program Manager → Center Director (8–9 years) → Executive Leadership (6 years) → CEO (August 2024). Both daughters attended CYC programs.',
    email:       't.ayala@chicagoyouthcenters.org',
    startDate:   '2024-08-09',
    note:        'Named permanent CEO after serving as interim following Kevin Cherep\'s departure to The Mission Continues.',
  },
  {
    name:        'Kari Lusk Basick',
    title:       'Chief Financial Officer',
    tenure:      null,
    salary:      149_493,
    bio:         'Oversees all financial operations, audit compliance, and grant reporting.',
    email:       null,
    startDate:   null,
    note:        null,
  },
  {
    name:        'Talina Carter Bowie',
    title:       'Chief Program Officer',
    tenure:      null,
    salary:      124_801,
    bio:         'Leads all direct service programs across 8 centers.',
    email:       'talina.carter-bowie@chicagoyouthcenters.org',
    startDate:   null,
    note:        null,
  },
  {
    name:        'Tarnisha Smith',
    title:       'Senior Director, People & Culture',
    tenure:      null,
    salary:      null,
    bio:         'Oversees human resources, staff development, and organizational culture.',
    email:       null,
    startDate:   null,
    note:        null,
  },
  {
    name:        'Devin Swift',
    title:       'Manager, STEAM & External Partnerships',
    tenure:      null,
    salary:      null,
    bio:         'Leads STEAM programming integration and external partner relationships.',
    email:       null,
    startDate:   null,
    note:        null,
  },
] as const;

// ── Sites / Centers ───────────────────────────────────────────────────────────

export const CYC_SITES = [
  {
    name:          'Calumet Heights',
    neighborhood:  'Calumet Heights',
    address:       '9207 S. Phillips Ave, Chicago, IL 60617',
    phone:         '(872) 228-0417',
    agesServed:    '15 months – 18 years + Seniors (55+)',
    programs:      ['Early Learning Head Start', 'Out-of-School Time', 'Summer', 'Senior Wellness'],
    openedYear:    2023,
    note:          'First new center in 30 years. Opened June 14, 2023. Features multi-purpose gym, tech center, outdoor playground.',
    isNewest:      true,
  },
  {
    name:          'South Shore — Rebecca K. Crown Youth Center',
    neighborhood:  'South Shore',
    address:       '7601 S. Phillips Ave, Chicago, IL 60649',
    phone:         '(773) 731-0444',
    agesServed:    '15 months – 18 years',
    programs:      ['Early Learning', 'Out-of-School Time', 'Summer'],
    openedYear:    2019,
    note:          'Opened 2019. Serves 200+ children.',
    isNewest:      false,
  },
  {
    name:          'Bronzeville — Elliott Donnelley / CYC on Campus at Ida B. Wells',
    neighborhood:  'Bronzeville',
    address:       '249 E. 37th St, Chicago, IL 60653',
    phone:         '(773) 268-3815',
    agesServed:    '5 – 18 years',
    programs:      ['Afterschool Enrichment', 'Community Schools', '21st Century Learning'],
    openedYear:    null,
    note:          'Elliott Donnelley building held for sale ($155K net book value). Community schools model.',
    isNewest:      false,
  },
  {
    name:          'North Lawndale — Sidney Epstein Youth Center',
    neighborhood:  'North Lawndale',
    address:       '3415 W. 13th Place, Chicago, IL 60623',
    phone:         '(773) 762-5655',
    agesServed:    '3 – 18 years',
    programs:      ['Early Learning', 'Out-of-School Time', 'Teen Development'],
    openedYear:    null,
    note:          'Serves 200+ children. Named endowment ($500K) for facility maintenance.',
    isNewest:      false,
  },
  {
    name:          'Humboldt Park — Centro Nuestro & George E. Taylor Center',
    neighborhood:  'Humboldt Park',
    address:       '3222 W. Division St, Chicago, IL 60651',
    phone:         '(773) 489-3157',
    agesServed:    '15 months – 5 years',
    programs:      ['Early Learning Head Start', 'Bilingual Programs'],
    openedYear:    null,
    note:          'Bilingual (Spanish/English) early childhood focus serving Humboldt Park\'s Latino community.',
    isNewest:      false,
  },
  {
    name:          'Riverdale — Dorothy Gautreaux Child Development Center',
    neighborhood:  'Riverdale',
    address:       '975 E. 132nd St, Chicago, IL 60627',
    phone:         '(773) 291-1000',
    agesServed:    '15 months – 5 years',
    programs:      ['Early Learning Head Start'],
    openedYear:    null,
    note:          'One of Chicago\'s most economically distressed neighborhoods. Early childhood focus.',
    isNewest:      false,
  },
  {
    name:          'Bridgeport — Fellowship House',
    neighborhood:  'Bridgeport',
    address:       '844 W. 32nd St, Chicago, IL 60608',
    phone:         '(312) 326-2282',
    agesServed:    'Mixed',
    programs:      ['Youth Programs', 'Community Programming'],
    openedYear:    null,
    note:          null,
    isNewest:      false,
  },
] as const;

// ── Impact Metrics (FY2024 Stewardship Report) ────────────────────────────────

export const CYC_IMPACT = {
  reportingYear: '2023-2024',
  youthServedTotal: 2_670,
  earlyLearningParticipants: 900,
  ostParticipants: 1_200,
  teenParticipants: 570,
  outcomes: {
    earlyLearning: [
      { metric: 'Met/exceeded literacy goals',          pct: 82 },
      { metric: 'Met/exceeded cognitive development',   pct: 81 },
      { metric: 'Met/exceeded physical development',    pct: 80 },
      { metric: 'Met/exceeded mathematics goals',       pct: 80 },
      { metric: 'Met/exceeded social-emotional goals',  pct: 78 },
      { metric: 'Ages 3-5 advanced to next grade level', pct: 100 },
    ],
    outOfSchoolTime: [
      { metric: 'Comfortable expressing through arts',  pct: 83 },
      { metric: 'Aspire to creative/innovative careers', pct: 83 },
      { metric: 'Understand community engagement',      pct: 71 },
      { metric: 'Enjoy outdoor play',                   pct: 94 },
      { metric: 'Plan to attend college',               pct: 92 },
    ],
  },
  charityNavigatorRating: 4,
  yearsInOperation: 68,
} as const;

// ── Board Intelligence ────────────────────────────────────────────────────────

export const CYC_BOARD = {
  chair:         'Phil Doherty',
  viceChair:     'Cathy Main',
  secretary:     'Devin Maddox',
  treasurer:     'Thomas D. Vander Veen',
  totalMembers:  40,
  boardGivingFY2025: {
    directContributions: 594_986,
    affiliatedCompanySponsorships: 321_591,
    totalBoardSourced: 916_577,
    pctOfTotalRevenue: 6.8,
  },
  auxiliaryBoard: '~40 young professionals from Chicago business community',
} as const;

// ── Derived Intelligence Signals ─────────────────────────────────────────────

export const CYC_INTELLIGENCE_FLAGS = [
  {
    severity:   'critical' as const,
    category:   'Liquidity',
    headline:   'Line of Credit Drawn for First Time',
    detail:     'CYC drew $455,000 on its BMO Harris line of credit in FY2025 (prior year: $0). Outstanding balance $455K of $1.5M limit at year-end. This is a new financial stress signal — the organization is borrowing to cover operating cash needs.',
    metric:     '$455K / $1.5M limit',
    action:     'Prioritize grants with fast disbursement timelines. Focus on unrestricted private foundation grants to rebuild cash cushion.',
  },
  {
    severity:   'critical' as const,
    category:   'Financial Health',
    headline:   'Operating Deficit: ($909,539)',
    detail:     'FY2025 ended with a $909,539 net deficit, reversing FY2024\'s $1.017M surplus. Expenses grew 3.2% while revenue fell 10%. Primary driver: $1.2M reduction in contributions (no repeat of FY2024 large one-time gifts) and $487K less in capital gains.',
    metric:     '($909K) deficit vs +$1.017M prior year',
    action:     'Mid-year budget review required. Evaluate program expenses relative to government contract renewals before FY2026 begins.',
  },
  {
    severity:   'warning' as const,
    category:   'Revenue Concentration',
    headline:   'Government Dependency at 74.6% of Revenue',
    detail:     'Federal and state government contracts represent $9,998,206 — 74.6% of total revenue. Head Start alone (~$8.3M) drives ~61% of all revenue. Auditors explicitly flag: "Any significant reduction in the level of this support could have an effect on the Organization\'s programs."',
    metric:     '74.6% — above 60% critical threshold',
    action:     'Accelerate private foundation grant pipeline. Every $1 of foundation revenue acquired reduces government dependency by ~0.5%.',
  },
  {
    severity:   'warning' as const,
    category:   'Liquidity',
    headline:   'Net Unrestricted Liquidity ~2.4 Months of Operations',
    detail:     'Available financial assets for general use total $3.87M, minus $1.01M in outstanding payables = ~$2.86M net liquid. That\'s approximately 2.4 months of operating expenses. Charity Navigator recommends minimum 3 months; 6+ months is strong. The endowment ($5.4M) and restricted gifts cannot cover operating shortfalls.',
    metric:     '2.4 months (target: 3-6 months)',
    action:     'Prioritize unrestricted and general-operating grants. Avoid restricted-purpose grants that create compliance overhead without liquidity benefit.',
  },
  {
    severity:   'info' as const,
    category:   'Capital Campaign',
    headline:   '"Imagine the Possibilities" Campaign: $966K in Active Pledges',
    detail:     'Multi-year capital campaign with pledges receivable of $966K net ($897K after discount/allowance). Board members account for $250K of pledges. Campaign goal is $8.2M over 3-5 years. FY2025 released $576K to operations.',
    metric:     '$966K pledged through FY2030',
    action:     'Ensure campaign pledge follow-up is tracked. Annual Giving component ($250K) renews FY2026-FY2028.',
  },
  {
    severity:   'info' as const,
    category:   'Program Efficiency',
    headline:   '86.0% Program Expense Ratio — Charity Navigator Benchmark Met',
    detail:     'Of every dollar spent, 86¢ goes directly to program services (early learning, afterschool, teen development). Management & General is 10.5%, Fundraising is 3.5%. This is well within Charity Navigator\'s 4-star threshold (≥75% program ratio).',
    metric:     '86.0% program ratio (Charity Navigator: 4/4 stars)',
    action:     'Maintain this ratio — it is a core selling point in grant applications and donor communications.',
  },
  {
    severity:   'info' as const,
    category:   'Revenue Trend',
    headline:   'Revenue Declining from FY2023 Peak',
    detail:     'FY2023 revenue was ~$17.3M (elevated by capital campaign gifts and COVID recovery funds). FY2024: $14.9M. FY2025: $13.4M. The organization is normalizing post-pandemic and post-campaign. The $18M budget figure cited internally likely reflects committed government contracts including the ~$4.25M in conditional grant pipeline not yet recognized.',
    metric:     '$17.3M → $14.9M → $13.4M (3-year trend)',
    action:     'Set realistic revenue expectations for FY2026. Fundir should target $1-2M in new private foundation grants to stabilize at $14-15M.',
  },
  {
    severity:   'info' as const,
    category:   'Board Engagement',
    headline:   'Board Contributed $916,577 in FY2025',
    detail:     'Board members gave $594,986 directly and contributed $321,591 through affiliated company sponsorships. Total board-sourced revenue = $916,577 (6.8% of total revenue). This is a strong indicator of board engagement relative to peers.',
    metric:     '$916K board-sourced (6.8% of revenue)',
    action:     'Track board giving trends year-over-year. Leverage board corporate connections for foundation introductions.',
  },
] as const;

// ── Revenue 3-Year Trend ─────────────────────────────────────────────────────

export const CYC_REVENUE_TREND = [
  { year: 'FY2023', revenue: 17_300_000, expenses: 13_500_000, surplus: 3_800_000, note: 'Capital campaign gifts; COVID recovery' },
  { year: 'FY2024', revenue: 14_893_766, expenses: 13_876_754, surplus: 1_017_012, note: 'Normalizing; $489K gain on asset sale' },
  { year: 'FY2025', revenue: 13_405_288, expenses: 14_314_827, surplus: -909_539,  note: 'Operating deficit; line of credit drawn' },
] as const;

// ── Program Concentration Analysis ───────────────────────────────────────────

export const CYC_PROGRAM_ANALYSIS = {
  earlyChildhood: {
    pctOfProgramExpenses:   70.3,
    expenseFY2025:          8_661_254,
    revenueFromGovt:        8_287_348,
    costPerChild:           9_623,    // $8.66M / 900 children
    efficiencyNote:         'Head Start fully funds this division; minimal private fundraising needed but creates single-source dependency',
    growthVsPrior:           9.6,     // +9.6% expenses YoY
  },
  schoolAge: {
    pctOfProgramExpenses:   18.1,
    expenseFY2025:          2_224_572,
    revenueFromGovt:        1_146_330,
    costPerChild:           1_854,    // $2.22M / 1,200 children
    fundingGap:             1_078_242, // expenses - govt revenue
    note:                   'Most cost-efficient division. 21st CCLC faces elimination risk — $1.16M at stake',
  },
  teenLeadership: {
    pctOfProgramExpenses:   11.6,
    expenseFY2025:          1_426_797,
    revenueFromGovt:          564_528,
    costPerTeen:            2_503,    // $1.43M / 570 teens
    fundingGap:               862_269,
    note:                   'Highest reliance on private philanthropy. Teen Shark Tank Jr. event April 2025 showcases program quality',
  },
} as const;

// ── 990 Screener Profile ─────────────────────────────────────────────────────
// Maps CYC's audited FY2025 financials into the shape the reverse-990 screening
// engine consumes. This is what makes financial eligibility scoring run on real,
// current, audited numbers instead of a stale ProPublica 990 snapshot — and
// keeps the discovery engine consistent with the Financials page.

const CYC_990_COMPUTED: ComputedFinancials = {
  totalRevenue:         CYC_INCOME_STATEMENT.revenue.totalRevenue,   // $13,405,288
  governmentGrantsPct:  75,   // $9.998M govt fees+grants / $13.405M = 74.6%
  privateGrantsPct:     17,   // $2.336M public support / $13.405M
  programRevenuePct:    3,    // $339K earned program fees / $13.405M (990 line)
  programEfficiencyPct: 86,   // $12.31M program svcs / $14.31M total expenses
  netAssets:            CYC_BALANCE_SHEET.netAssets.totalNetAssets,  // $15,047,471
  monthsOfReserves:     CYC_LIQUIDITY.monthsOfLiquidity,             // 2.4 (audited)
  govtDependency:       'critical',
  filingYear:           CYC_INCOME_STATEMENT.fiscalYear,             // 2025
};

const CYC_990_ORG: OrgProfile = {
  ein:            '36-2344429',
  name:           'Chicago Youth Centers',
  city:           'Chicago',
  state:          'IL',
  ntee_code:      'O20',   // Youth Development — Youth Centers/Clubs
  income_amount:  CYC_INCOME_STATEMENT.revenue.totalRevenue,
  asset_amount:   CYC_BALANCE_SHEET.assets.totalAssets,
  revenue_amount: CYC_INCOME_STATEMENT.revenue.totalRevenue,
};

// 3-year filing history — feeds the multi-year revenue-trend signal and the
// executive-compensation efficiency signal (latest year, by tax_prd_yr).
const CYC_990_HISTORY: Array<Pick<Filing990, 'tax_prd_yr' | 'totrevenue' | 'totfuncexpns' | 'compnsatncurrofcr'>> = [
  { tax_prd_yr: 2023, totrevenue: 17_300_000, totfuncexpns: 13_500_000, compnsatncurrofcr: 0 },
  { tax_prd_yr: 2024, totrevenue: 14_893_766, totfuncexpns: 13_876_754, compnsatncurrofcr: 0 },
  { tax_prd_yr: 2025, totrevenue: 13_405_288, totfuncexpns: 14_314_827, compnsatncurrofcr: 431_695 },
];

export const CYC_FINANCIAL_PROFILE = {
  computed: CYC_990_COMPUTED,
  org:      CYC_990_ORG,
  history:  CYC_990_HISTORY,
};
