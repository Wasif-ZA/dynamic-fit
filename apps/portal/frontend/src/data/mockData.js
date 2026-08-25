// Local/mock data used until the FitPortal API + database are wired up.
// Item shape follows the schema agreed with FitSolver:
// ItemCode, ItemReference, Width, Length, Depth, Weight, BoxGroup, Hazardous

export const CATALOGUE_ITEMS = [
  {
    ItemCode: 'ITM-001',
    ItemReference: 'Widget A',
    Width: 100,
    Length: 200,
    Depth: 50,
    Weight: 1,
    BoxGroup: 'GROUP-A',
    Hazardous: false,
  },
  {
    ItemCode: 'ITM-002',
    ItemReference: 'Widget B',
    Width: 300,
    Length: 150,
    Depth: 75,
    Weight: 2.8,
    BoxGroup: '',
    Hazardous: false,
  },
  {
    ItemCode: 'ITM-003',
    ItemReference: 'Fragile Glassware',
    Width: 80,
    Length: 80,
    Depth: 120,
    Weight: 0.82,
    BoxGroup: 'GROUP-B',
    Hazardous: false,
  },
  {
    ItemCode: 'ITM-004',
    ItemReference: 'Aerosol Cleaner (12pk)',
    Width: 250,
    Length: 180,
    Depth: 180,
    Weight: 6.4,
    BoxGroup: 'GROUP-C',
    Hazardous: true,
  },
];

export const SEED_ORDERS = [
  {
    id: 'ORD-1001',
    reference: 'Bunnings Warehouse - Chullora',
    status: 'Draft',
    createdAt: '2026-08-18',
    items: [
      { ...CATALOGUE_ITEMS[0], qty: 4 },
      { ...CATALOGUE_ITEMS[2], qty: 2 },
    ],
  },
  {
    id: 'ORD-1002',
    reference: 'Officeworks DC - Erskine Park',
    status: 'Ready to pack',
    createdAt: '2026-08-20',
    items: [
      { ...CATALOGUE_ITEMS[1], qty: 10 },
      { ...CATALOGUE_ITEMS[3], qty: 1 },
    ],
  },
];

export const emptyItemDraft = () => ({
  ItemCode: '',
  ItemReference: '',
  Width: '',
  Length: '',
  Depth: '',
  Weight: '',
  BoxGroup: '',
  Hazardous: false,
  qty: 1,
});
