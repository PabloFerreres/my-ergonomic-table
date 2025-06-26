const names = [
  "Alex Honnold", "Janja Garnbret", "Adam Ondra", "Ashima Shiraishi", "Tomoa Narasaki",
  "Angela Eiter", "Chris Sharma", "Sasha DiGiulian", "Sean McColl", "Mina Markovic",
  "Yuji Hirayama", "Margo Hayes", "Jernej Kruder", "Kyra Condie", "Stefano Ghisolfi",
  "Melissa Le Nevé", "Jakob Schubert", "Julia Chanourdie", "Domen Škofic", "Shauna Coxsey"
];

const surnames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Garcia", "Martinez", "Lee",
  "Walker", "White", "Hall", "Young", "King", "Wright", "Lopez", "Hill", "Scott", "Green"
];

const countries = ["USA", "Slovenia", "Czech Republic", "Japan", "Austria", "Canada", "UK", "France", "Italy", "Spain"];
const styles = ["Lead", "Boulder", "Speed", "Trad", "Alpine"];
const grades = ["5.14d", "9a+", "V15", "9c", "5.15a", "9a", "V14", "8c+", "9b+", "V13"];
const shoes = ["La Sportiva", "Scarpa", "Five Ten", "Mad Rock", "Tenaya", "Unparallel", "Evolv"];
const diets = ["Vegan", "Vegetarian", "Omnivore", "Pescatarian"];
const rocks = ["Limestone", "Granite", "Sandstone", "Gritstone", "Basalt"];
const clubs = ["Vertical Limit", "Crux Masters", "Summit Seekers", "Rock Warriors", "Peak Performance"];

function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Generate 100 rows (first 20 are your real climbers, rest are plausible fakes)
export const climberTableData: (string | number)[][] = [];

// (1) Add 20 real ones
const realClimbers: (string | number)[][] = [
  // ...your real climber data rows (or leave it empty if only fake)
];
climberTableData.push(...realClimbers);

// (2) Add 80+ fake ones
for (let i = climberTableData.length; i < 100; ++i) {
  const firstName = random(names);
  const lastName = random(surnames);
  climberTableData.push([
    `${firstName.split(" ")[0]} ${lastName}`,                // Name
    randomInt(16, 56),                                       // Age
    random(countries),                                       // Nationality
    randomInt(2, 40),                                        // Years Climbing
    random(styles),                                          // Main Style
    random(grades),                                          // Hardest Grade
    randomInt(0, 40),                                        // Podiums
    random(shoes),                                           // Shoe Brand
    randomInt(150, 195),                                     // Height
    randomInt(45, 88),                                       // Weight
    random(diets),                                           // Diet
    randomInt(1, 8),                                         // Avg. Weekly Sessions
    random(rocks),                                           // Preferred Rock
    `Crag #${randomInt(1, 80)}`,                             // Favorite Crag
    `@${firstName.replace(/\s/g, '').toLowerCase()}${randomInt(1,999)}`, // Instagram
    `${random(surnames)} ${random(surnames)}`,               // Coach Name
    randomInt(40, 65),                                       // Resting HR
    (randomInt(0, 10) / 10).toFixed(1),                      // Ape Index
    randomInt(10, 45),                                       // Max Pull-Ups
    randomInt(0, 10),                                        // Country Titles
    randomInt(0, 12),                                        // IFSC Medals
    randomInt(2, 30),                                        // Training Hours
    randomInt(30, 80),                                       // Vertical Leap (cm)
    randomInt(0, 5),                                         // Sponsorships
    random(clubs)                                            // Climbing Club
  ]);
}

export const climberColHeaders = [
  "Name",
  "Age",
  "Nationality",
  "Years Climbing",
  "Main Style",
  "Hardest Grade",
  "Podiums",
  "Shoe Brand",
  "Height (cm)",
  "Weight (kg)",
  "Diet",
  "Avg. Weekly Sessions",
  "Preferred Rock",
  "Favorite Crag",
  "Instagram",
  "Coach Name",
  "Resting HR",
  "Ape Index",
  "Max Pull-Ups",
  "Country Titles",
  "IFSC Medals",
  "Training Hours",
  "Vertical Leap (cm)",
  "Sponsorships",
  "Climbing Club"
];

export const climberColWidths = Array.from({ length: 25 }, (_, i) =>
  [170, 60, 110, 90, 135, 110, 90, 120, 65, 65, 95, 100, 120, 130, 180, 120, 75, 65, 90, 100, 110, 95, 110, 95, 130][i] || 90
);
