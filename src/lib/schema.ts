// Database tables. These are created automatically the first time the app
// connects, so there is no SQL to paste anywhere. "if not exists" makes it
// safe to run every time.

export const SCHEMA_SQL = `
create table if not exists subjects (
  id serial primary key,
  slug text not null unique,
  name text not null,
  board text not null default '',
  spec_code text not null default '',
  kind text not null default 'standard',
  target_grade int not null default 9,
  stretch_grade int,
  boundaries jsonb not null default '{}',
  boundary_max int not null default 100,
  sort_order int not null default 0
);

create table if not exists topics (
  id serial primary key,
  subject_id int not null references subjects(id) on delete cascade,
  name text not null,
  group_name text not null default '',
  paper text not null default '',
  weight double precision not null default 1,
  status text not null default 'unrated',
  last_reviewed date,
  next_review date,
  is_set_text boolean not null default false,
  archived boolean not null default false,
  sort_order int not null default 0,
  source text not null default 'spec',
  created_at timestamptz not null default now()
);

create table if not exists topic_reviews (
  id serial primary key,
  topic_id int not null references topics(id) on delete cascade,
  session_id int,
  date date not null,
  status text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id serial primary key,
  subject_id int not null references subjects(id) on delete cascade,
  date date not null,
  minutes int not null,
  topic_ids int[] not null default '{}',
  went_well text not null default '',
  struggles text not null default '',
  source text not null default 'app',
  created_at timestamptz not null default now()
);

create table if not exists paper_scores (
  id serial primary key,
  subject_id int not null references subjects(id) on delete cascade,
  topic_id int references topics(id) on delete set null,
  paper text not null default '',
  score double precision not null,
  max_score double precision not null,
  date date not null,
  kind text not null default 'past paper',
  ao_scores jsonb,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists mistakes (
  id serial primary key,
  subject_id int not null references subjects(id) on delete cascade,
  topic_id int references topics(id) on delete set null,
  error_type text not null,
  note text not null default '',
  date date not null,
  created_at timestamptz not null default now()
);

create table if not exists assessments (
  id serial primary key,
  subject_id int not null references subjects(id) on delete cascade,
  kind text not null,
  title text not null,
  date date not null,
  tbc boolean not null default false,
  topic_ids int[] not null default '{}',
  notes text not null default '',
  source text not null default 'manual',
  external_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists homework (
  id serial primary key,
  subject_id int references subjects(id) on delete set null,
  title text not null,
  due_date date not null,
  notes text not null default '',
  done boolean not null default false,
  source text not null default 'manual',
  external_id text unique,
  class_name text not null default '',
  minutes int not null default 30,
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id serial primary key,
  topic_id int not null references topics(id) on delete cascade,
  text text not null,
  theme text not null default '',
  character text not null default '',
  times_quizzed int not null default 0,
  times_correct int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists text_notes (
  id serial primary key,
  topic_id int not null references topics(id) on delete cascade,
  kind text not null,
  name text not null,
  notes text not null default ''
);

create table if not exists daily_plans (
  date date primary key,
  items jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

-- Phase 2: Microsoft Teams
alter table homework add column if not exists link text not null default '';

create table if not exists integrations (
  provider text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists teams_classes (
  class_id text primary key,
  name text not null,
  subject_id int references subjects(id) on delete set null
);
`;
