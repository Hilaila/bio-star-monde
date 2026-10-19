// Schéma des données de Bio Star Monde Éden, partagé par la fonction Appwrite et le serveur Node (SQLite).
// Chaque table possède en plus un identifiant « id » (« $id » dans Appwrite).
// Règle de la chaîne connectée : un compte Pi (owner) → une exploitation → des parcelles → des lots → des étapes.

const text = (key, size, required = false) => ({ type: 'string', body: { key, size, required } });
const float = (key, required = false) => ({ type: 'float', body: { key, required } });
const bool = (key) => ({ type: 'boolean', body: { key, required: false, default: false } });
const date = (key, required = true) => ({ type: 'datetime', body: { key, required } });
const choice = (key, elements, required = true) => ({ type: 'enum', body: { key, elements, required } });

export const EVENT_TYPES = ['preparation', 'semis', 'intrant', 'traitement', 'irrigation', 'recolte', 'transformation', 'stockage', 'controle', 'vente', 'correction', 'autre'];
// done : module terminé ; pending : module pratique en attente de validation ; todo : à faire (annulé ou refusé).
export const PROGRESS_STATUS = ['done', 'pending', 'todo'];

export const TABLES = {
  orders: {
    name: 'Commandes',
    columns: [
      text('username', 64, true), text('product_id', 64, true), float('amount', true), text('memo', 200, true),
      text('payment_id', 128, true), text('txid', 256), choice('status', ['approved', 'completed', 'cancelled']), date('created_at')
    ],
    indexes: [
      { key: 'payment_id_unique', type: 'unique', columns: ['payment_id'] },
      { key: 'username_idx', type: 'key', columns: ['username'] }
    ]
  },
  farms: {
    name: 'Exploitations',
    columns: [
      text('owner', 64, true), text('name', 120, true), text('country', 60, true), text('region', 80, true), text('locality', 80),
      float('area_ha'), text('practices', 500), bool('show_training'), date('created_at'), date('updated_at')
    ],
    indexes: [{ key: 'owner_unique', type: 'unique', columns: ['owner'] }]
  },
  plots: {
    name: 'Parcelles',
    columns: [
      text('farm_id', 36, true), text('owner', 64, true), text('name', 80, true), float('area_ha'), text('soil', 80), text('crop', 80),
      date('created_at'), date('updated_at')
    ],
    indexes: [{ key: 'owner_idx', type: 'key', columns: ['owner'] }]
  },
  lots: {
    name: 'Lots',
    columns: [
      text('farm_id', 36, true), text('plot_id', 36), text('owner', 64, true), text('product', 120, true), float('quantity'), text('unit', 16),
      date('created_at')
    ],
    indexes: [{ key: 'owner_idx', type: 'key', columns: ['owner'] }]
  },
  lot_events: {
    name: 'Étapes des lots',
    columns: [
      text('lot_id', 36, true), text('owner', 64, true), choice('type', EVENT_TYPES), date('date'), text('note', 300), date('created_at')
    ],
    indexes: [
      { key: 'lot_idx', type: 'key', columns: ['lot_id'] },
      { key: 'owner_idx', type: 'key', columns: ['owner'] }
    ]
  },
  // BioStar Academy : un module suivi par un compte (identifiant de ligne calculé à partir du compte, du cours et du module).
  progress: {
    name: 'Progression',
    columns: [
      text('owner', 64, true), text('course_id', 64, true), float('module_index', true), choice('status', PROGRESS_STATUS),
      date('created_at'), date('updated_at')
    ],
    indexes: [
      { key: 'owner_idx', type: 'key', columns: ['owner'] },
      { key: 'status_idx', type: 'key', columns: ['status'] }
    ]
  },
  // Attestation de suivi : son code (ATT-XXXXXXXX) sert d'identifiant de ligne et de clé de vérification publique.
  attestations: {
    name: 'Attestations',
    columns: [
      text('owner', 64, true), text('course_id', 64, true), text('course_title', 160, true), text('hash', 64, true),
      choice('status', ['valid', 'revoked']), date('created_at')
    ],
    indexes: [
      { key: 'owner_idx', type: 'key', columns: ['owner'] },
      { key: 'owner_course_unique', type: 'unique', columns: ['owner', 'course_id'] }
    ]
  },
  // BioSmart : demande d'avis à un conseiller de terrain.
  advice: {
    name: 'Demandes de conseil',
    columns: [
      text('owner', 64, true), text('crop', 40, true), text('symptom', 200), text('cause', 200), text('message', 1000),
      choice('status', ['open', 'answered']), text('answer', 2000), date('answered_at', false), date('created_at')
    ],
    indexes: [
      { key: 'owner_idx', type: 'key', columns: ['owner'] },
      { key: 'status_idx', type: 'key', columns: ['status'] }
    ]
  },
  // Messages écrits à l'Institut depuis l'application.
  messages: {
    name: 'Messages',
    columns: [text('owner', 64, true), text('message', 1000, true), date('created_at')],
    indexes: [{ key: 'owner_idx', type: 'key', columns: ['owner'] }]
  }
};

export const columnKeys = (table) => TABLES[table].columns.map((c) => c.body.key);
export const booleanKeys = (table) => TABLES[table].columns.filter((c) => c.type === 'boolean').map((c) => c.body.key);
