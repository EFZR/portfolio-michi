/**
 * Paquete compartido entre la web (`apps/web`) y el panel (`apps/admin`).
 *
 * Contenido previsto (ver `docs/fase-2-panel-admin.md` y `docs/fase-2-ui-dinamica.md`):
 *
 *   config.ts      ← credenciales de Firebase (hecho)
 *   firebase.ts    ← cliente único: app, auth, firestore, storage (hecho)
 *   meta/          ← el meta-esquema: valida los esquemas JSON        · paso 2
 *   schemas/       ← espejo de los esquemas publicados                · paso 2b
 *   compiler/      ← JSON → Zod, evaluador de condiciones             · paso 6b
 *   repositories/  ← readArticles(), saveProject()…                   · paso 5
 */

export {
  readFirebaseConfig,
  hasFirebaseConfig,
  IncompleteConfigError,
  type FirebaseConfig,
} from './config'

export {
  getFirebase,
  getFirebaseAuth,
  getFirestoreDb,
  getFirebaseStorage,
  enablePersistentSession,
} from './firebase'

export {
  metaSchema,
  fieldSchema,
  conditionSchema,
  FIELD_TYPES,
  OPERATORS,
  RULE_TYPES,
  LOCALES,
  PRIMARY_LOCALE,
  t,
  onlyPrimary,
  type SchemaDoc,
  type FieldType,
  type Operator,
  type RuleType,
  type Condition,
  type Locale,
  type Localized,
} from './meta/index'

export {
  compile,
  compileField,
  compileFields,
  compileVisible,
  validateCollection,
  emptyDoc,
  emptyField,
  evaluate,
  evaluateAll,
  evaluateAffected,
  buildGraph,
  SchemaCycleError,
  type VisibilityGraph,
} from './compiler/index'
