// Base d'aliments courants. Valeurs pour 100 g (ou 100 ml) : kcal, protéines, glucides, lipides.
// `unit` = poids d'une portion type en grammes, pour pré-remplir la quantité.
export const FOODS = [
  // Protéines
  { n: 'Blanc de poulet cuit', k: 165, p: 31, c: 0, f: 3.6, unit: 150 },
  { n: 'Steak haché 5% cuit', k: 160, p: 26, c: 0, f: 6, unit: 125 },
  { n: 'Steak haché 15% cuit', k: 250, p: 25, c: 0, f: 17, unit: 125 },
  { n: 'Saumon cuit', k: 206, p: 22, c: 0, f: 13, unit: 130 },
  { n: 'Thon en conserve (naturel)', k: 116, p: 26, c: 0, f: 1, unit: 100 },
  { n: 'Cabillaud cuit', k: 105, p: 23, c: 0, f: 0.9, unit: 150 },
  { n: 'Crevettes cuites', k: 99, p: 24, c: 0.2, f: 0.3, unit: 100 },
  { n: 'Jambon blanc', k: 115, p: 20, c: 1, f: 3.5, unit: 40 },
  { n: 'Œuf entier', k: 143, p: 12.6, c: 0.7, f: 9.5, unit: 55 },
  { n: 'Blanc d\'œuf', k: 52, p: 11, c: 0.7, f: 0.2, unit: 33 },
  { n: 'Tofu ferme', k: 144, p: 15, c: 3, f: 8.7, unit: 100 },
  { n: 'Whey protéine (poudre)', k: 380, p: 78, c: 7, f: 5, unit: 30 },
  { n: 'Dinde (escalope) cuite', k: 135, p: 30, c: 0, f: 1.5, unit: 150 },
  // Produits laitiers
  { n: 'Fromage blanc 0%', k: 47, p: 7.5, c: 4, f: 0.2, unit: 150 },
  { n: 'Skyr nature', k: 63, p: 11, c: 4, f: 0.2, unit: 150 },
  { n: 'Yaourt nature', k: 61, p: 4, c: 5, f: 3.3, unit: 125 },
  { n: 'Lait demi-écrémé', k: 46, p: 3.3, c: 4.8, f: 1.6, unit: 250 },
  { n: 'Emmental', k: 380, p: 28, c: 0, f: 30, unit: 30 },
  { n: 'Mozzarella', k: 250, p: 18, c: 2, f: 19, unit: 60 },
  { n: 'Beurre', k: 745, p: 0.7, c: 0.6, f: 82, unit: 10 },
  // Féculents
  { n: 'Riz blanc cuit', k: 130, p: 2.7, c: 28, f: 0.3, unit: 200 },
  { n: 'Riz complet cuit', k: 123, p: 2.7, c: 26, f: 1, unit: 200 },
  { n: 'Pâtes cuites', k: 157, p: 5.8, c: 31, f: 0.9, unit: 200 },
  { n: 'Pomme de terre cuite', k: 87, p: 1.9, c: 20, f: 0.1, unit: 200 },
  { n: 'Patate douce cuite', k: 90, p: 2, c: 21, f: 0.1, unit: 200 },
  { n: 'Frites', k: 312, p: 3.4, c: 41, f: 15, unit: 150 },
  { n: 'Quinoa cuit', k: 120, p: 4.4, c: 21, f: 1.9, unit: 180 },
  { n: 'Flocons d\'avoine', k: 372, p: 13, c: 59, f: 7, unit: 50 },
  { n: 'Pain blanc / baguette', k: 270, p: 9, c: 55, f: 1.5, unit: 60 },
  { n: 'Pain complet', k: 250, p: 9, c: 45, f: 3.5, unit: 60 },
  { n: 'Lentilles cuites', k: 116, p: 9, c: 20, f: 0.4, unit: 200 },
  { n: 'Pois chiches cuits', k: 164, p: 9, c: 27, f: 2.6, unit: 150 },
  { n: 'Céréales petit-déj (moyenne)', k: 380, p: 8, c: 80, f: 3, unit: 40 },
  // Fruits & légumes
  { n: 'Banane', k: 89, p: 1.1, c: 23, f: 0.3, unit: 120 },
  { n: 'Pomme', k: 52, p: 0.3, c: 14, f: 0.2, unit: 150 },
  { n: 'Orange', k: 47, p: 0.9, c: 12, f: 0.1, unit: 150 },
  { n: 'Fraises', k: 32, p: 0.7, c: 7.7, f: 0.3, unit: 150 },
  { n: 'Myrtilles', k: 57, p: 0.7, c: 14, f: 0.3, unit: 100 },
  { n: 'Avocat', k: 160, p: 2, c: 9, f: 15, unit: 80 },
  { n: 'Brocoli cuit', k: 35, p: 2.4, c: 7, f: 0.4, unit: 150 },
  { n: 'Haricots verts cuits', k: 35, p: 1.9, c: 7.9, f: 0.1, unit: 150 },
  { n: 'Salade verte', k: 15, p: 1.4, c: 2.9, f: 0.2, unit: 50 },
  { n: 'Tomate', k: 18, p: 0.9, c: 3.9, f: 0.2, unit: 120 },
  { n: 'Carotte', k: 41, p: 0.9, c: 10, f: 0.2, unit: 100 },
  { n: 'Courgette cuite', k: 17, p: 1.2, c: 3.1, f: 0.3, unit: 150 },
  // Matières grasses & oléagineux
  { n: 'Huile d\'olive', k: 884, p: 0, c: 0, f: 100, unit: 10 },
  { n: 'Amandes', k: 579, p: 21, c: 22, f: 50, unit: 30 },
  { n: 'Noix', k: 654, p: 15, c: 14, f: 65, unit: 30 },
  { n: 'Beurre de cacahuète', k: 588, p: 25, c: 20, f: 50, unit: 20 },
  // Plats & divers
  { n: 'Pizza margherita', k: 250, p: 11, c: 31, f: 9, unit: 300 },
  { n: 'Burger (fast-food)', k: 260, p: 13, c: 26, f: 12, unit: 220 },
  { n: 'Kebab sandwich', k: 230, p: 12, c: 22, f: 10, unit: 350 },
  { n: 'Sushi / maki (moyenne)', k: 150, p: 6, c: 28, f: 1.5, unit: 200 },
  { n: 'Croissant', k: 406, p: 8, c: 45, f: 21, unit: 60 },
  { n: 'Chocolat noir 70%', k: 580, p: 8, c: 33, f: 43, unit: 20 },
  { n: 'Miel', k: 304, p: 0.3, c: 82, f: 0, unit: 15 },
  { n: 'Confiture', k: 250, p: 0.4, c: 60, f: 0.1, unit: 20 },
  // Boissons
  { n: 'Jus d\'orange', k: 45, p: 0.7, c: 10, f: 0.2, unit: 250 },
  { n: 'Soda sucré', k: 42, p: 0, c: 10.6, f: 0, unit: 330 },
  { n: 'Bière', k: 43, p: 0.5, c: 3.6, f: 0, unit: 330 },
  { n: 'Vin rouge', k: 85, p: 0.1, c: 2.6, f: 0, unit: 150 },
  { n: 'Café au lait', k: 30, p: 1.6, c: 2.5, f: 1.5, unit: 200 },
];

// Shakers & compléments. Valeurs pour 100 g de poudre ; `dose` = une dose type en grammes.
export const SUPPLEMENTS = [
  { id: 'whey', n: 'Whey', emoji: '🥛', k: 380, p: 78, c: 7, f: 5, dose: 30 },
  { id: 'isolate', n: 'Whey isolate', emoji: '💎', k: 370, p: 88, c: 2, f: 1, dose: 30 },
  { id: 'casein', n: 'Caséine', emoji: '🌙', k: 360, p: 78, c: 6, f: 2, dose: 30 },
  { id: 'vegan', n: 'Protéine végétale', emoji: '🌱', k: 380, p: 75, c: 6, f: 7, dose: 30 },
  { id: 'gainer', n: 'Gainer', emoji: '💪', k: 380, p: 18, c: 70, f: 3, dose: 100 },
  { id: 'creatine', n: 'Créatine', emoji: '⚡', k: 0, p: 0, c: 0, f: 0, dose: 5 },
  { id: 'bar', n: 'Barre protéinée', emoji: '🍫', k: 350, p: 33, c: 35, f: 10, dose: 60, solid: true },
];

// Liquides pour le shaker. Valeurs pour 100 ml.
export const LIQUIDS = [
  { id: 'water', n: 'Eau', k: 0, p: 0, c: 0, f: 0 },
  { id: 'semi', n: 'Lait demi-écrémé', k: 46, p: 3.3, c: 4.8, f: 1.6 },
  { id: 'skim', n: 'Lait écrémé', k: 35, p: 3.4, c: 5, f: 0.1 },
  { id: 'whole', n: 'Lait entier', k: 64, p: 3.2, c: 4.7, f: 3.6 },
  { id: 'almond', n: 'Lait d\'amande', k: 24, p: 0.5, c: 3, f: 1.1 },
  { id: 'oat', n: 'Lait d\'avoine', k: 45, p: 1, c: 6.5, f: 1.5 },
  { id: 'soy', n: 'Lait de soja', k: 39, p: 3.3, c: 2.5, f: 1.8 },
];
