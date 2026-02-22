// Types matching web client/src/lib/store.ts

export type City = 'NYC' | 'Chicago';
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type TimeBlock = 'Day' | 'Evening' | 'Night';
export type Budget = '$' | '$$' | '$$$' | '$$$$';
export type Energy = 'Chill' | 'Vibey' | 'Going out' | 'Full send';
export type Category =
  | 'Dinner' | 'Drinks' | 'Brunch' | 'Cafe' | 'Coffee'
  | 'Dive Bar' | 'Cocktails' | 'Wine Bar' | 'Brewery'
  | 'Club' | 'Lounge' | 'Rooftop' | 'Speakeasy'
  | 'Live Music' | 'Dancing' | 'Activity' | 'Bowling'
  | 'Karaoke' | 'Comedy' | 'Arcade' | 'Museum'
  | 'Walk' | 'Conversation' | 'Meeting New People'
  | 'Big Group' | 'Date Night';
export type HardNo = 'Clubs' | 'Loud places' | 'Ticketed events' | 'Late nights' | 'Expensive spots';
export type DiscoveryStyle = 'hidden_gems' | 'popular' | 'mixed';
export type CrowdPreference = 'quiet' | 'buzzing' | 'no_preference';

export const CITIES: City[] = ['NYC', 'Chicago'];
export const BUDGETS: Budget[] = ['$', '$$', '$$$', '$$$$'];
export const ENERGIES: Energy[] = ['Chill', 'Vibey', 'Going out', 'Full send'];

export const CATEGORIES: Category[] = [
  'Dinner', 'Drinks', 'Brunch', 'Cafe', 'Coffee',
  'Dive Bar', 'Cocktails', 'Wine Bar', 'Brewery',
  'Club', 'Lounge', 'Rooftop', 'Speakeasy',
  'Live Music', 'Dancing', 'Activity', 'Bowling',
  'Karaoke', 'Comedy', 'Arcade', 'Museum',
  'Walk', 'Conversation', 'Meeting New People',
  'Big Group', 'Date Night',
];

export const HARD_NOS: HardNo[] = ['Clubs', 'Loud places', 'Ticketed events', 'Late nights', 'Expensive spots'];

export const NEIGHBORHOODS: Record<City, string[]> = {
  NYC: [
    'Lower East Side', 'East Village', 'West Village', 'SoHo', 'NoLita',
    'Chelsea', 'Flatiron', 'Midtown', 'Upper East Side', 'Upper West Side',
    'Williamsburg', 'Bushwick', 'Greenpoint', 'DUMBO', 'Park Slope',
    'Fort Greene', 'Bed-Stuy', 'Cobble Hill', 'Astoria', 'Long Island City',
    'Harlem', 'Washington Heights', 'Hell\'s Kitchen', 'Murray Hill', 'Tribeca',
  ],
  Chicago: [
    'River North', 'West Loop', 'Wicker Park', 'Logan Square', 'Lincoln Park',
    'Lakeview', 'Bucktown', 'Gold Coast', 'Old Town', 'Pilsen',
    'Hyde Park', 'Andersonville', 'Uptown', 'Ravenswood', 'South Loop',
    'Chinatown', 'Bridgeport', 'Ukrainian Village', 'Humboldt Park', 'Avondale',
  ],
};

export const CITY_COORDS: Record<City, { lat: number; lng: number }> = {
  NYC: { lat: 40.7128, lng: -73.9352 },
  Chicago: { lat: 41.8781, lng: -87.6298 },
};
