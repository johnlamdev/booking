import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * 時間一律以 UTC 儲存（timestamptz），只在邊界轉換為 workspace 的 IANA timezone。
 * 見 docs/DESIGN.md §3.6。
 */
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const workspaceTypeEnum = pgEnum('workspace_type', ['PERSONAL', 'TEAM'])
export const memberRoleEnum = pgEnum('member_role', ['OWNER', 'ADMIN', 'INSTRUCTOR'])
export const memberStatusEnum = pgEnum('member_status', ['ACTIVE', 'INVITED', 'DISABLED'])

/**
 * 業務層使用者。
 *
 * 刻意不對 Supabase 的 `auth.users` 下外鍵：schema 因此是純 Postgres，
 * 測試可在乾淨的 postgres:16 上跑完整 migration，日後也能換掉 Supabase。
 * 代價是 auth 與業務使用者之間沒有 DB 層參照完整性，由 bootstrap 流程保證。
 * 見 docs/DESIGN.md §2.3。
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authUserId: uuid('auth_user_id').notNull().unique(),
  email: text('email').notNull(),
  ...timestamps,
})

/** 資料隔離單位。MVP 每位老師一個 PERSONAL workspace。 */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** 一律以小寫儲存，達成 case-insensitive 唯一，不需 citext。見 docs/DESIGN.md §3.2。 */
  slug: text('slug').notNull().unique(),
  /** IANA timezone，例如 Asia/Hong_Kong。timezone 只存在此層級。 */
  timezone: text('timezone').notNull().default('Asia/Hong_Kong'),
  type: workspaceTypeEnum('type').notNull().default('PERSONAL'),
  /** 公開頁是否已發佈。預設 false。 */
  isPublic: boolean('is_public').notNull().default(false),
  /** 邀請測試帳號；可安全使用示範資料及 WhatsApp 統一轉送。 */
  isExperience: boolean('is_experience').notNull().default(false),
  /** 體驗資料版本，讓日後重置或升級時能辨認資料集。 */
  experienceVersion: text('experience_version'),
  /** 首次進入後台、建立相對日期體驗資料的時間。 */
  experienceStartedAt: timestamp('experience_started_at', { withTimezone: true }),

  // --- 可預約時段的推導參數（docs/DESIGN.md §4.4）---
  /** 列舉起始時間的間隔。30 分鐘可整除 60/90 分鐘課，選項不致過多。 */
  slotIntervalMinutes: integer('slot_interval_minutes').notNull().default(60),
  /** 不可預約此刻起 N 分鐘內的時段，避免學生臨時提交而老師來不及反應。 */
  minNoticeMinutes: integer('min_notice_minutes').notNull().default(120),
  /** 學生最多可看多遠。推導必須有上限，否則會一路算到無限遠。 */
  bookingHorizonDays: integer('booking_horizon_days').notNull().default(60),

  ...timestamps,
})

/**
 * 使用者與 workspace 的關係。
 * 授權一律檢查此表的 ACTIVE membership，不以 user_id 直接推斷 ownership（規格 §14.1）。
 */
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull(),
    status: memberStatusEnum('status').notNull().default('ACTIVE'),
    ...timestamps,
  },
  (t) => [
    unique('workspace_members_workspace_user_key').on(t.workspaceId, t.userId),
    index('workspace_members_user_idx').on(t.userId),
  ],
)

/**
 * 提供課堂的人。公開頁顯示的資料來自此表。
 * `userId` 可為 null，為日後不需登入的 staff profile 預留。
 */
export const instructorProfiles = pgTable(
  'instructor_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // 供 Phase 2 的 services 以複合外鍵 (instructor_id, workspace_id) 參照，
    // 由資料庫直接擋掉跨 workspace 關聯。見 docs/DESIGN.md §3.3。
    unique('instructor_profiles_id_workspace_key').on(t.id, t.workspaceId),
    // MVP：每個 workspace 只有一位 active instructor
    uniqueIndex('instructor_profiles_one_active_per_workspace')
      .on(t.workspaceId)
      .where(sql`${t.isActive}`),
  ],
)

/**
 * MVP 只有一對一私人課，故值域暫限 PRIVATE。
 * 日後加小組班是 `ALTER TYPE ... ADD VALUE 'GROUP'`，屬純加法。
 * 見 docs/DESIGN.md §8。
 */
export const serviceTypeEnum = pgEnum('service_type', ['PRIVATE'])
export const serviceStatusEnum = pgEnum('service_status', ['ACTIVE', 'INACTIVE'])

export const SERVICE_MIN_DURATION = 15
export const SERVICE_MAX_DURATION = 240

/**
 * 老師的學生名冊。
 *
 * 學生不需要登入；電話或電郵只用來把不同查詢連回同一位學生。同名但沒有相同
 * 聯絡方式者不會自動合併，避免錯誤串連兩個人的約堂紀錄。
 */
export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    email: text('email'),
    normalizedEmail: text('normalized_email'),
    phone: text('phone'),
    normalizedPhone: text('normalized_phone'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('students_id_workspace_key').on(t.id, t.workspaceId),
    uniqueIndex('students_workspace_email_unique')
      .on(t.workspaceId, t.normalizedEmail)
      .where(sql`${t.normalizedEmail} is not null`),
    uniqueIndex('students_workspace_phone_unique')
      .on(t.workspaceId, t.normalizedPhone)
      .where(sql`${t.normalizedPhone} is not null`),
    index('students_workspace_name_idx').on(t.workspaceId, t.displayName),
  ],
)

/** 老師提供的服務種類，例如「60 分鐘私人課」。 */
export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    instructorId: uuid('instructor_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    serviceType: serviceTypeEnum('service_type').notNull().default('PRIVATE'),
    durationMinutes: integer('duration_minutes').notNull(),
    status: serviceStatusEnum('status').notNull().default('ACTIVE'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // 複合外鍵：instructor 必須與 service 屬於同一 workspace，由資料庫保證，
    // 不倚賴應用層記得檢查（規格 §9.8 check 3）
    foreignKey({
      columns: [t.instructorId, t.workspaceId],
      foreignColumns: [instructorProfiles.id, instructorProfiles.workspaceId],
      name: 'services_instructor_workspace_fk',
    }),
    // 供 booking_inquiries 以複合外鍵參照
    unique('services_id_workspace_key').on(t.id, t.workspaceId),
    check(
      'services_duration_range',
      sql`${t.durationMinutes} between ${sql.raw(String(SERVICE_MIN_DURATION))} and ${sql.raw(String(SERVICE_MAX_DURATION))}`,
    ),
    index('services_workspace_idx').on(t.workspaceId),
  ],
)

/**
 * 每週開放時間規則。
 *
 * 老師設定的是「開放時間」，不是一節一節的課；可預約時段在學生查詢時推導，
 * 不預先建立資料列。見 docs/DESIGN.md §4。
 *
 * 同一 weekday 可有多列，用以表達午休（例如 10:00–13:00 與 14:00–18:00）。
 * 時間存 `time` 而非 timestamptz：規則本身沒有日期，套用到具體日期時才換算 UTC。
 */
export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    instructorId: uuid('instructor_id').notNull(),
    /** 0 = 星期日 … 6 = 星期六，與 JS `Date.getDay()` 一致 */
    weekday: integer('weekday').notNull(),
    /** workspace timezone 的牆上時間，HH:MM:SS */
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.instructorId, t.workspaceId],
      foreignColumns: [instructorProfiles.id, instructorProfiles.workspaceId],
      name: 'availability_rules_instructor_workspace_fk',
    }),
    check('availability_rules_weekday_range', sql`${t.weekday} between 0 and 6`),
    check('availability_rules_end_after_start', sql`${t.endTime} > ${t.startTime}`),
    index('availability_rules_instructor_idx').on(t.instructorId, t.weekday),
  ],
)

/**
 * 特定日期的覆寫，用來表達休假或當天的特別時間。
 *
 * `isClosed = true` → 當天整天不開放，忽略每週規則。
 * 否則以 startTime/endTime 取代該日的每週規則。
 */
export const availabilityExceptions = pgTable(
  'availability_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    instructorId: uuid('instructor_id').notNull(),
    /** workspace timezone 的日曆日期 */
    date: date('date').notNull(),
    isClosed: boolean('is_closed').notNull().default(true),
    startTime: time('start_time'),
    endTime: time('end_time'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.instructorId, t.workspaceId],
      foreignColumns: [instructorProfiles.id, instructorProfiles.workspaceId],
      name: 'availability_exceptions_instructor_workspace_fk',
    }),
    unique('availability_exceptions_instructor_date_key').on(t.instructorId, t.date),
    // 不是休假時，必須有完整的起訖時間且結束晚於開始
    check(
      'availability_exceptions_times_valid',
      sql`(${t.isClosed} and ${t.startTime} is null and ${t.endTime} is null)
          or (not ${t.isClosed} and ${t.startTime} is not null and ${t.endTime} is not null and ${t.endTime} > ${t.startTime})`,
    ),
    index('availability_exceptions_lookup_idx').on(t.instructorId, t.date),
  ],
)

export const inquiryStatusEnum = pgEnum('inquiry_status', [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'REJECTED_CONFLICT',
  'EXPIRED',
  'CANCELLED',
])

export const bookingSourceEnum = pgEnum('booking_source', ['STUDENT', 'INSTRUCTOR'])

export const actorTypeEnum = pgEnum('actor_type', ['STUDENT', 'USER', 'SYSTEM'])

export const STUDENT_NOTE_MAX_LENGTH = 500

/**
 * 學生提交的預約查詢。
 *
 * **查詢不等於預約**：PENDING 不佔用老師的時間，只有 CONFIRMED 才佔用。
 *
 * 因可預約時段是推導結果、沒有資料列可指向，故直接記錄 start_at / end_at。
 * 這些時間由 server 依開放規則驗證後寫入，不信任 client 傳入的值（規格 §11.4）。
 */
export const bookingInquiries = pgTable(
  'booking_inquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    instructorId: uuid('instructor_id').notNull(),
    serviceId: uuid('service_id').notNull(),
    studentId: uuid('student_id'),

    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),

    studentName: text('student_name').notNull(),
    studentEmail: text('student_email'),
    studentPhone: text('student_phone'),
    studentNote: text('student_note'),

    status: inquiryStatusEnum('status').notNull().default('PENDING'),
    /** 學生自行提交，或由導師直接在日曆代為建立。 */
    source: bookingSourceEnum('source').notNull().default('STUDENT'),
    rejectionReason: text('rejection_reason'),
    cancellationReason: text('cancellation_reason'),

    /** 記錄同意時間，作為處理個人資料的依據（規格 §8.7、§13.3） */
    privacyConsentAt: timestamp('privacy_consent_at', { withTimezone: true }),

    /** 只存 SHA-256 hash；明文 token 僅在建立當下回傳一次（規格 §9.8） */
    statusTokenHash: text('status_token_hash').notNull().unique(),

    /** 防止重複點擊產生多筆相同查詢（規格 §8.7） */
    idempotencyKey: text('idempotency_key').notNull(),

    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByUserId: uuid('cancelled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.instructorId, t.workspaceId],
      foreignColumns: [instructorProfiles.id, instructorProfiles.workspaceId],
      name: 'booking_inquiries_instructor_workspace_fk',
    }),
    foreignKey({
      columns: [t.serviceId, t.workspaceId],
      foreignColumns: [services.id, services.workspaceId],
      name: 'booking_inquiries_service_workspace_fk',
    }),
    foreignKey({
      columns: [t.studentId, t.workspaceId],
      foreignColumns: [students.id, students.workspaceId],
      name: 'booking_inquiries_student_workspace_fk',
    }),
    check('booking_inquiries_end_after_start', sql`${t.endAt} > ${t.startAt}`),
    // 學生自行提交必須提供聯絡方式；導師代約可稍後自行補充。
    check(
      'booking_inquiries_contact_present',
      sql`${t.source} = 'INSTRUCTOR' or ${t.studentEmail} is not null or ${t.studentPhone} is not null`,
    ),
    check(
      'booking_inquiries_note_length',
      sql`${t.studentNote} is null or length(${t.studentNote}) <= ${sql.raw(String(STUDENT_NOTE_MAX_LENGTH))}`,
    ),
    // 同一時段的重複提交只會留下一筆
    unique('booking_inquiries_idempotency_key').on(t.instructorId, t.startAt, t.idempotencyKey),
    index('booking_inquiries_inbox_idx').on(t.workspaceId, t.status, t.submittedAt),
    index('booking_inquiries_time_idx').on(t.instructorId, t.startAt),
  ],
)

/** 狀態變更 audit。不存敏感的 request payload（規格 §9.9）。 */
export const inquiryStatusEvents = pgTable(
  'inquiry_status_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingInquiryId: uuid('booking_inquiry_id')
      .notNull()
      .references(() => bookingInquiries.id, { onDelete: 'cascade' }),
    fromStatus: inquiryStatusEnum('from_status'),
    toStatus: inquiryStatusEnum('to_status').notNull(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('inquiry_status_events_inquiry_idx').on(t.bookingInquiryId, t.createdAt)],
)

/** 已確認課堂的改期提案；原時段在對方接受前繼續保留。 */
export const rescheduleStatusEnum = pgEnum('reschedule_status', ['PENDING', 'ACCEPTED', 'DECLINED'])
export const rescheduleInitiatorEnum = pgEnum('reschedule_initiator', ['STUDENT', 'INSTRUCTOR'])

export const rescheduleProposals = pgTable(
  'reschedule_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingInquiryId: uuid('booking_inquiry_id').notNull()
      .references(() => bookingInquiries.id, { onDelete: 'cascade' }),
    proposedStartAt: timestamp('proposed_start_at', { withTimezone: true }).notNull(),
    proposedEndAt: timestamp('proposed_end_at', { withTimezone: true }).notNull(),
    initiatedBy: rescheduleInitiatorEnum('initiated_by').notNull(),
    status: rescheduleStatusEnum('status').notNull().default('PENDING'),
    /** 老師提出改期時，把這個連結傳給學生；明文 token 不會儲存。 */
    responseTokenHash: text('response_token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    check('reschedule_proposals_end_after_start', sql`${t.proposedEndAt} > ${t.proposedStartAt}`),
    uniqueIndex('reschedule_one_pending_per_booking').on(t.bookingInquiryId)
      .where(sql`${t.status} = 'PENDING'`),
    index('reschedule_proposals_booking_idx').on(t.bookingInquiryId, t.createdAt),
  ],
)

/** 可選 Google Calendar 連接。Refresh token 用應用程式密鑰加密後才入庫。 */
export const googleCalendarConnections = pgTable('google_calendar_connections', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  calendarId: text('calendar_id').notNull().default('primary'),
  lastSyncError: text('last_sync_error'),
  ...timestamps,
})

/**
 * 公開 endpoint 的限流計數。
 *
 * 以資料表實作而非 Redis：serverless 下 in-memory 無效，而引入 Upstash 等
 * 付費服務不符規格 §17.5「避免無必要依賴」。見 docs/DESIGN.md §5.1。
 */
export const rateLimitHits = pgTable(
  'rate_limit_hits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 限流鍵，例如 `inquiry:<ip hash>`。不存原始 IP。 */
    bucket: text('bucket').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rate_limit_hits_bucket_idx').on(t.bucket, t.createdAt)],
)

export type BookingInquiry = typeof bookingInquiries.$inferSelect
export type InquiryStatusEvent = typeof inquiryStatusEvents.$inferSelect
export type Student = typeof students.$inferSelect

export type User = typeof users.$inferSelect
export type Workspace = typeof workspaces.$inferSelect
export type WorkspaceMember = typeof workspaceMembers.$inferSelect
export type InstructorProfile = typeof instructorProfiles.$inferSelect
export type Service = typeof services.$inferSelect
export type AvailabilityRule = typeof availabilityRules.$inferSelect
export type AvailabilityException = typeof availabilityExceptions.$inferSelect
