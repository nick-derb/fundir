export interface StateData {
  name: string;
  counties: string[];
}

export const US_COUNTIES: Record<string, StateData> = {
  AL: {
    name: 'Alabama',
    counties: [
      'Baldwin', 'Blount', 'Calhoun', 'Coffee', 'Colbert', 'Cullman', 'DeKalb',
      'Elmore', 'Etowah', 'Houston', 'Jefferson', 'Lee', 'Limestone', 'Madison',
      'Marshall', 'Mobile', 'Montgomery', 'Morgan', 'Shelby', 'Tuscaloosa',
    ],
  },
  AK: {
    name: 'Alaska',
    counties: [
      'Anchorage', 'Bethel', 'Bristol Bay', 'Denali', 'Fairbanks North Star',
      'Juneau', 'Kenai Peninsula', 'Ketchikan Gateway', 'Kodiak Island',
      'Matanuska-Susitna', 'Nome', 'North Slope', 'Northwest Arctic',
      'Prince of Wales-Hyder', 'Sitka', 'Southeast Fairbanks', 'Valdez-Cordova',
      'Wrangell', 'Yakutat', 'Yukon-Koyukuk',
    ],
  },
  AZ: {
    name: 'Arizona',
    counties: [
      'Apache', 'Cochise', 'Coconino', 'Gila', 'Graham', 'Greenlee', 'La Paz',
      'Maricopa', 'Mohave', 'Navajo', 'Pima', 'Pinal', 'Santa Cruz', 'Yavapai', 'Yuma',
    ],
  },
  AR: {
    name: 'Arkansas',
    counties: [
      'Benton', 'Carroll', 'Craighead', 'Crawford', 'Crittenden', 'Faulkner',
      'Garland', 'Jefferson', 'Miller', 'Mississippi', 'Pulaski', 'Saline',
      'Sebastian', 'Union', 'Washington', 'White', 'Yell',
    ],
  },
  CA: {
    name: 'California',
    counties: [
      'Alameda', 'Contra Costa', 'Fresno', 'Kern', 'Los Angeles', 'Marin',
      'Merced', 'Monterey', 'Orange', 'Placer', 'Riverside', 'Sacramento',
      'San Bernardino', 'San Diego', 'San Francisco', 'San Joaquin', 'San Mateo',
      'Santa Barbara', 'Santa Clara', 'Shasta', 'Solano', 'Sonoma', 'Stanislaus',
      'Tulare', 'Ventura',
    ],
  },
  CO: {
    name: 'Colorado',
    counties: [
      'Adams', 'Arapahoe', 'Boulder', 'Broomfield', 'Denver', 'Douglas',
      'El Paso', 'Elbert', 'Garfield', 'Jefferson', 'Larimer', 'Mesa',
      'Montrose', 'Pueblo', 'Summit', 'Weld',
    ],
  },
  CT: {
    name: 'Connecticut',
    counties: [
      'Fairfield', 'Hartford', 'Litchfield', 'Middlesex', 'New Haven',
      'New London', 'Tolland', 'Windham',
    ],
  },
  DE: {
    name: 'Delaware',
    counties: ['Kent', 'New Castle', 'Sussex'],
  },
  FL: {
    name: 'Florida',
    counties: [
      'Alachua', 'Bay', 'Brevard', 'Broward', 'Charlotte', 'Collier', 'Duval',
      'Escambia', 'Hillsborough', 'Lake', 'Lee', 'Leon', 'Manatee', 'Marion',
      'Miami-Dade', 'Okaloosa', 'Orange', 'Osceola', 'Palm Beach', 'Pasco',
      'Pinellas', 'Polk', 'Sarasota', 'Seminole', 'St. Johns', 'St. Lucie',
      'Volusia',
    ],
  },
  GA: {
    name: 'Georgia',
    counties: [
      'Bibb', 'Carroll', 'Chatham', 'Cherokee', 'Clarke', 'Clayton', 'Cobb',
      'Columbia', 'DeKalb', 'Dougherty', 'Fayette', 'Floyd', 'Forsyth', 'Fulton',
      'Gwinnett', 'Hall', 'Henry', 'Houston', 'Muscogee', 'Newton', 'Richmond',
      'Rockdale', 'Spalding', 'Thomas', 'Walton',
    ],
  },
  HI: {
    name: 'Hawaii',
    counties: ['Hawaii', 'Honolulu', 'Kalawao', 'Kauai', 'Maui'],
  },
  ID: {
    name: 'Idaho',
    counties: [
      'Ada', 'Bannock', 'Blaine', 'Bonneville', 'Canyon', 'Cassia',
      'Elmore', 'Jefferson', 'Kootenai', 'Latah', 'Minidoka', 'Nez Perce',
      'Payette', 'Power', 'Twin Falls', 'Valley',
    ],
  },
  IL: {
    name: 'Illinois',
    counties: [
      'Adams', 'Alexander', 'Bond', 'Boone', 'Brown', 'Bureau', 'Calhoun',
      'Carroll', 'Cass', 'Champaign', 'Christian', 'Clark', 'Clay', 'Clinton',
      'Coles', 'Cook', 'Crawford', 'Cumberland', 'DeKalb', 'De Witt', 'Douglas',
      'DuPage', 'Edgar', 'Edwards', 'Effingham', 'Fayette', 'Ford', 'Franklin',
      'Fulton', 'Gallatin', 'Greene', 'Grundy', 'Hamilton', 'Hancock', 'Hardin',
      'Henderson', 'Henry', 'Iroquois', 'Jackson', 'Jasper', 'Jefferson', 'Jersey',
      'Jo Daviess', 'Johnson', 'Kane', 'Kankakee', 'Kendall', 'Knox', 'Lake',
      'La Salle', 'Lawrence', 'Lee', 'Livingston', 'Logan', 'Macon', 'Macoupin',
      'Madison', 'Marion', 'Marshall', 'Mason', 'Massac', 'McDonough', 'McHenry',
      'McLean', 'Menard', 'Mercer', 'Monroe', 'Montgomery', 'Morgan', 'Moultrie',
      'Ogle', 'Peoria', 'Perry', 'Piatt', 'Pike', 'Pope', 'Pulaski', 'Putnam',
      'Randolph', 'Richland', 'Rock Island', 'Saline', 'Sangamon', 'Schuyler',
      'Scott', 'Shelby', 'St. Clair', 'Stark', 'Stephenson', 'Tazewell', 'Union',
      'Vermilion', 'Wabash', 'Warren', 'Washington', 'Wayne', 'White', 'Whiteside',
      'Will', 'Williamson', 'Winnebago', 'Woodford',
    ],
  },
  IN: {
    name: 'Indiana',
    counties: [
      'Allen', 'Bartholomew', 'Clark', 'Delaware', 'Elkhart', 'Floyd', 'Grant',
      'Hamilton', 'Hancock', 'Hendricks', 'Henry', 'Howard', 'Johnson', 'Lake',
      'LaPorte', 'Madison', 'Marion', 'Monroe', 'Morgan', 'Porter', 'Ripley',
      'St. Joseph', 'Tippecanoe', 'Vanderburgh', 'Vigo', 'Wayne',
    ],
  },
  IA: {
    name: 'Iowa',
    counties: [
      'Black Hawk', 'Cerro Gordo', 'Clinton', 'Dallas', 'Dubuque', 'Johnson',
      'Jones', 'Linn', 'Polk', 'Pottawattamie', 'Scott', 'Story', 'Warren',
      'Washington', 'Woodbury',
    ],
  },
  KS: {
    name: 'Kansas',
    counties: [
      'Butler', 'Crawford', 'Douglas', 'Ellis', 'Ford', 'Harvey', 'Jackson',
      'Johnson', 'Leavenworth', 'Lyon', 'Montgomery', 'Reno', 'Riley',
      'Saline', 'Sedgwick', 'Shawnee', 'Wyandotte',
    ],
  },
  KY: {
    name: 'Kentucky',
    counties: [
      'Boone', 'Boyd', 'Bullitt', 'Campbell', 'Christian', 'Clark', 'Daviess',
      'Fayette', 'Floyd', 'Hardin', 'Henderson', 'Jefferson', 'Jessamine',
      'Kenton', 'Madison', 'McCracken', 'Oldham', 'Pike', 'Scott', 'Warren',
    ],
  },
  LA: {
    name: 'Louisiana',
    counties: [
      'Ascension', 'Bossier', 'Caddo', 'Calcasieu', 'East Baton Rouge',
      'Jefferson', 'Lafayette', 'Lafourche', 'Livingston', 'Orleans',
      'Ouachita', 'Rapides', 'St. Landry', 'St. Tammany', 'Tangipahoa',
      'Terrebonne', 'Webster',
    ],
  },
  ME: {
    name: 'Maine',
    counties: [
      'Androscoggin', 'Aroostook', 'Cumberland', 'Hancock', 'Kennebec',
      'Knox', 'Lincoln', 'Oxford', 'Penobscot', 'Piscataquis', 'Sagadahoc',
      'Somerset', 'Waldo', 'Washington', 'York',
    ],
  },
  MD: {
    name: 'Maryland',
    counties: [
      'Allegany', 'Anne Arundel', 'Baltimore', 'Baltimore City', 'Calvert',
      'Carroll', 'Cecil', 'Charles', 'Frederick', 'Harford', 'Howard',
      'Montgomery', "Prince George's", 'Queen Anne\'s', 'St. Mary\'s',
      'Washington', 'Wicomico', 'Worcester',
    ],
  },
  MA: {
    name: 'Massachusetts',
    counties: [
      'Barnstable', 'Berkshire', 'Bristol', 'Dukes', 'Essex', 'Franklin',
      'Hampden', 'Hampshire', 'Middlesex', 'Nantucket', 'Norfolk', 'Plymouth',
      'Suffolk', 'Worcester',
    ],
  },
  MI: {
    name: 'Michigan',
    counties: [
      'Bay', 'Berrien', 'Calhoun', 'Clinton', 'Genesee', 'Ingham', 'Jackson',
      'Kalamazoo', 'Kent', 'Lapeer', 'Lenawee', 'Livingston', 'Macomb',
      'Monroe', 'Muskegon', 'Oakland', 'Ottawa', 'Saginaw', 'St. Clair',
      'Traverse City', 'Washtenaw', 'Wayne',
    ],
  },
  MN: {
    name: 'Minnesota',
    counties: [
      'Anoka', 'Beltrami', 'Blue Earth', 'Carlton', 'Carver', 'Clay',
      'Dakota', 'Goodhue', 'Hennepin', 'Olmsted', 'Otter Tail', 'Ramsey',
      'Rice', 'Scott', 'Sherburne', 'St. Louis', 'Stearns', 'Washington',
      'Wright',
    ],
  },
  MS: {
    name: 'Mississippi',
    counties: [
      'Copiah', 'DeSoto', 'Forrest', 'Harrison', 'Hinds', 'Jackson',
      'Jones', 'Lamar', 'Lauderdale', 'Lee', 'Lowndes', 'Madison',
      'Oktibbeha', 'Pearl River', 'Rankin', 'Warren', 'Washington',
    ],
  },
  MO: {
    name: 'Missouri',
    counties: [
      'Boone', 'Buchanan', 'Cape Girardeau', 'Cass', 'Christian', 'Clay',
      'Cole', 'Franklin', 'Greene', 'Jackson', 'Jasper', 'Jefferson',
      'Newton', 'Platte', 'St. Charles', 'St. Louis', 'St. Louis City',
      'Taney',
    ],
  },
  MT: {
    name: 'Montana',
    counties: [
      'Big Horn', 'Cascade', 'Custer', 'Flathead', 'Gallatin', 'Hill',
      'Lake', 'Lewis and Clark', 'Lincoln', 'Missoula', 'Park', 'Ravalli',
      'Richland', 'Roosevelt', 'Silverbow', 'Yellowstone',
    ],
  },
  NE: {
    name: 'Nebraska',
    counties: [
      'Adams', 'Buffalo', 'Cass', 'Dakota', 'Dawson', 'Dodge', 'Douglas',
      'Hall', 'Lancaster', 'Lincoln', 'Madison', 'Platte', 'Sarpy',
      'Scotts Bluff', 'Saunders',
    ],
  },
  NV: {
    name: 'Nevada',
    counties: [
      'Carson City', 'Churchill', 'Clark', 'Douglas', 'Elko', 'Humboldt',
      'Lander', 'Lyon', 'Nye', 'Pershing', 'Storey', 'Washoe', 'White Pine',
    ],
  },
  NH: {
    name: 'New Hampshire',
    counties: [
      'Belknap', 'Carroll', 'Cheshire', 'Coos', 'Grafton', 'Hillsborough',
      'Merrimack', 'Rockingham', 'Strafford', 'Sullivan',
    ],
  },
  NJ: {
    name: 'New Jersey',
    counties: [
      'Atlantic', 'Bergen', 'Burlington', 'Camden', 'Cape May', 'Cumberland',
      'Essex', 'Gloucester', 'Hudson', 'Hunterdon', 'Mercer', 'Middlesex',
      'Monmouth', 'Morris', 'Ocean', 'Passaic', 'Salem', 'Somerset',
      'Sussex', 'Union', 'Warren',
    ],
  },
  NM: {
    name: 'New Mexico',
    counties: [
      'Bernalillo', 'Chaves', 'Cibola', 'Dona Ana', 'Eddy', 'Grant',
      'Lea', 'Lincoln', 'Luna', 'McKinley', 'Otero', 'Rio Arriba',
      'Roosevelt', 'San Juan', 'San Miguel', 'Sandoval', 'Santa Fe',
      'Socorro', 'Taos', 'Valencia',
    ],
  },
  NY: {
    name: 'New York',
    counties: [
      'Albany', 'Bronx', 'Broome', 'Dutchess', 'Erie', 'Kings', 'Monroe',
      'Nassau', 'New York', 'Niagara', 'Oneida', 'Onondaga', 'Ontario',
      'Orange', 'Queens', 'Richmond', 'Rockland', 'Saratoga', 'Suffolk',
      'Ulster', 'Westchester',
    ],
  },
  NC: {
    name: 'North Carolina',
    counties: [
      'Alamance', 'Buncombe', 'Cabarrus', 'Catawba', 'Cumberland', 'Davidson',
      'Durham', 'Forsyth', 'Gaston', 'Guilford', 'Iredell', 'Johnston',
      'Lincoln', 'Mecklenburg', 'Moore', 'New Hanover', 'Onslow', 'Orange',
      'Randolph', 'Rowan', 'Union', 'Wake', 'Wayne',
    ],
  },
  ND: {
    name: 'North Dakota',
    counties: [
      'Barnes', 'Burleigh', 'Cass', 'Grand Forks', 'McLean', 'Mercer',
      'Morton', 'Ramsey', 'Richland', 'Stark', 'Stutsman', 'Ward',
      'Williams',
    ],
  },
  OH: {
    name: 'Ohio',
    counties: [
      'Butler', 'Clark', 'Clermont', 'Cuyahoga', 'Delaware', 'Franklin',
      'Greene', 'Hamilton', 'Lake', 'Licking', 'Lorain', 'Lucas', 'Mahoning',
      'Medina', 'Montgomery', 'Portage', 'Richland', 'Stark', 'Summit',
      'Trumbull', 'Warren', 'Wood',
    ],
  },
  OK: {
    name: 'Oklahoma',
    counties: [
      'Canadian', 'Cherokee', 'Cleveland', 'Comanche', 'Creek', 'Garfield',
      'Grady', 'Kay', 'Le Flore', 'Logan', 'Mayes', 'Muskogee', 'Oklahoma',
      'Osage', 'Ottawa', 'Payne', 'Pontotoc', 'Pottawatomie', 'Rogers',
      'Seminole', 'Tulsa', 'Wagoner', 'Washington',
    ],
  },
  OR: {
    name: 'Oregon',
    counties: [
      'Benton', 'Clackamas', 'Clatsop', 'Columbia', 'Deschutes', 'Douglas',
      'Jackson', 'Josephine', 'Klamath', 'Lane', 'Lincoln', 'Linn', 'Marion',
      'Multnomah', 'Polk', 'Tillamook', 'Umatilla', 'Washington', 'Yamhill',
    ],
  },
  PA: {
    name: 'Pennsylvania',
    counties: [
      'Allegheny', 'Berks', 'Bucks', 'Butler', 'Chester', 'Cumberland',
      'Dauphin', 'Delaware', 'Erie', 'Lackawanna', 'Lancaster', 'Lebanon',
      'Lehigh', 'Luzerne', 'Monroe', 'Montgomery', 'Northampton', 'Philadelphia',
      'Westmoreland', 'York',
    ],
  },
  RI: {
    name: 'Rhode Island',
    counties: ['Bristol', 'Kent', 'Newport', 'Providence', 'Washington'],
  },
  SC: {
    name: 'South Carolina',
    counties: [
      'Aiken', 'Anderson', 'Berkeley', 'Charleston', 'Cherokee', 'Dorchester',
      'Florence', 'Greenville', 'Horry', 'Lexington', 'Pickens', 'Richland',
      'Spartanburg', 'Sumter', 'York',
    ],
  },
  SD: {
    name: 'South Dakota',
    counties: [
      'Beadle', 'Brown', 'Codington', 'Davison', 'Hughes', 'Lawrence',
      'Lincoln', 'Meade', 'Minnehaha', 'Pennington', 'Yankton',
    ],
  },
  TN: {
    name: 'Tennessee',
    counties: [
      'Anderson', 'Blount', 'Bradley', 'Davidson', 'Hamilton', 'Haywood',
      'Knox', 'Madison', 'Maury', 'Montgomery', 'Putnam', 'Rutherford',
      'Shelby', 'Sullivan', 'Sumner', 'Tipton', 'Washington', 'Williamson',
      'Wilson',
    ],
  },
  TX: {
    name: 'Texas',
    counties: [
      'Bexar', 'Brazoria', 'Brazos', 'Cameron', 'Collin', 'Dallas',
      'Denton', 'El Paso', 'Fort Bend', 'Galveston', 'Harris', 'Hidalgo',
      'Jefferson', 'Johnson', 'Lubbock', 'McLennan', 'Midland', 'Montgomery',
      'Nueces', 'Parker', 'Potter', 'Smith', 'Tarrant', 'Taylor',
      'Travis', 'Webb', 'Williamson',
    ],
  },
  UT: {
    name: 'Utah',
    counties: [
      'Box Elder', 'Cache', 'Carbon', 'Davis', 'Duchesne', 'Iron',
      'Juab', 'Kane', 'Millard', 'Salt Lake', 'San Juan', 'Sevier',
      'Summit', 'Tooele', 'Uintah', 'Utah', 'Wasatch', 'Washington',
      'Weber',
    ],
  },
  VT: {
    name: 'Vermont',
    counties: [
      'Addison', 'Bennington', 'Caledonia', 'Chittenden', 'Essex', 'Franklin',
      'Grand Isle', 'Lamoille', 'Orange', 'Orleans', 'Rutland', 'Washington',
      'Windham', 'Windsor',
    ],
  },
  VA: {
    name: 'Virginia',
    counties: [
      'Albemarle', 'Arlington', 'Augusta', 'Bedford', 'Chesterfield', 'Fairfax',
      'Frederick', 'Hanover', 'Henrico', 'James City', 'Loudoun', 'Montgomery',
      'Prince William', 'Roanoke', 'Rockingham', 'Spotsylvania', 'Stafford',
      'Virginia Beach City', 'York',
    ],
  },
  WA: {
    name: 'Washington',
    counties: [
      'Clark', 'Cowlitz', 'Franklin', 'Grant', 'Kitsap', 'King', 'Pierce',
      'Skagit', 'Snohomish', 'Spokane', 'Thurston', 'Whatcom', 'Yakima',
    ],
  },
  WV: {
    name: 'West Virginia',
    counties: [
      'Berkeley', 'Boone', 'Cabell', 'Greenbrier', 'Harrison', 'Jackson',
      'Jefferson', 'Kanawha', 'Marion', 'Mercer', 'Mingo', 'Monongalia',
      'Nicholas', 'Preston', 'Putnam', 'Raleigh', 'Randolph', 'Tucker',
      'Wayne', 'Wood',
    ],
  },
  WI: {
    name: 'Wisconsin',
    counties: [
      'Adams', 'Brown', 'Calumet', 'Columbia', 'Dane', 'Dodge', 'Door',
      'Douglas', 'Dunn', 'Eau Claire', 'Fond du Lac', 'Jefferson', 'Kenosha',
      'La Crosse', 'Manitowoc', 'Marathon', 'Milwaukee', 'Outagamie', 'Ozaukee',
      'Racine', 'Rock', 'Sauk', 'Sheboygan', 'Walworth', 'Washington',
      'Waukesha', 'Winnebago', 'Wood',
    ],
  },
  WY: {
    name: 'Wyoming',
    counties: [
      'Albany', 'Big Horn', 'Campbell', 'Carbon', 'Fremont', 'Hot Springs',
      'Johnson', 'Laramie', 'Lincoln', 'Natrona', 'Park', 'Platte',
      'Sheridan', 'Sublette', 'Sweetwater', 'Teton', 'Uinta', 'Washakie',
    ],
  },
};
