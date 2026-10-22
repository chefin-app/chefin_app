export type MockRow = Record<string, unknown>;

type Filter = {
  kind: 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'ilike';
  column: string;
  value: unknown;
};

type Sort = { column: string; ascending: boolean };

type Relation = {
  table: string;
  many: boolean;
  fromKey: string;
  toKey: string;
};

const RELATIONS: Record<string, Record<string, Relation>> = {
  listings: {
    profiles: { table: 'profiles', many: false, fromKey: 'cook_id', toKey: 'id' },
    reviews: { table: 'reviews', many: true, fromKey: 'id', toKey: 'listing_id' },
  },
  orders: {
    listings: { table: 'listings', many: false, fromKey: 'listing_id', toKey: 'id' },
    profiles: { table: 'profiles', many: false, fromKey: 'customer_id', toKey: 'id' },
    reviews: { table: 'reviews', many: false, fromKey: 'id', toKey: 'order_id' },
    delivery_jobs: { table: 'delivery_jobs', many: false, fromKey: 'delivery_job_id', toKey: 'id' },
  },
  reviews: {
    listings: { table: 'listings', many: false, fromKey: 'listing_id', toKey: 'id' },
    profiles: { table: 'profiles', many: false, fromKey: 'customer_id', toKey: 'id' },
  },
  menu_option_groups: {
    menu_options: { table: 'menu_options', many: true, fromKey: 'id', toKey: 'group_id' },
    listing_option_groups: {
      table: 'listing_option_groups',
      many: true,
      fromKey: 'id',
      toKey: 'group_id',
    },
  },
};

type QueryResult = { data: unknown; error: { message: string } | null; count: number | null };

const compare = (left: unknown, right: unknown): number => {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
};

const matchesIlike = (value: unknown, pattern: unknown): boolean => {
  const source = String(value ?? '').toLowerCase();
  const expression = String(pattern ?? '')
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${expression}$`).test(source);
};

const splitSelect = (spec: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of spec) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

let idSequence = 100;

export const nextMockId = (): string => {
  idSequence += 1;
  return `00000000-0000-4000-8000-${idSequence.toString(16).padStart(12, '0')}`;
};

export class MockDb {
  tables: Record<string, MockRow[]>;

  constructor(tables: Record<string, MockRow[]>) {
    this.tables = tables;
  }

  from(table: string): MockQuery {
    if (!this.tables[table]) this.tables[table] = [];
    return new MockQuery(this, table);
  }

  rows(table: string): MockRow[] {
    return this.tables[table] ?? [];
  }
}

export class MockQuery implements PromiseLike<QueryResult> {
  private filters: Filter[] = [];
  private sorts: Sort[] = [];
  private max: number | null = null;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: MockRow | MockRow[] | null = null;
  private columns = '*';
  private selected = false;
  private head = false;
  private countExact = false;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private conflict = 'id';

  private readonly db: MockDb;
  private readonly table: string;

  constructor(db: MockDb, table: string) {
    this.db = db;
    this.table = table;
  }

  select(columns = '*', options?: { count?: string; head?: boolean }): this {
    this.columns = columns;
    this.selected = true;
    this.head = options?.head === true;
    this.countExact = options?.count === 'exact';
    return this;
  }

  insert(payload: MockRow | MockRow[]): this {
    this.operation = 'insert';
    this.payload = payload;
    this.selected = false;
    return this;
  }

  update(payload: MockRow): this {
    this.operation = 'update';
    this.payload = payload;
    this.selected = false;
    return this;
  }

  upsert(payload: MockRow | MockRow[], options?: { onConflict?: string }): this {
    this.operation = 'upsert';
    this.payload = payload;
    this.conflict = options?.onConflict ?? 'id';
    this.selected = false;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    this.selected = false;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ kind: 'neq', column, value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ kind: 'in', column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ kind: 'gt', column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ kind: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ kind: 'lt', column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ kind: 'lte', column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ kind: 'is', column, value });
    return this;
  }

  ilike(column: string, value: unknown): this {
    this.filters.push({ kind: 'ilike', column, value });
    return this;
  }

  like(column: string, value: unknown): this {
    return this.ilike(column, value);
  }

  or(): this {
    return this;
  }

  not(): this {
    return this;
  }

  match(criteria: Record<string, unknown>): this {
    Object.entries(criteria).forEach(([column, value]) => this.eq(column, value));
    return this;
  }

  filter(column: string, operator: string, value: unknown): this {
    if (operator === 'eq') return this.eq(column, value);
    if (operator === 'in') return this.in(column, Array.isArray(value) ? value : [value]);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sorts.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.max = count;
    return this;
  }

  range(from: number, to: number): this {
    this.max = to + 1;
    this.filters.push({ kind: 'gte', column: '__range_from', value: from });
    return this;
  }

  single(): this {
    this.mode = 'single';
    return this;
  }

  maybeSingle(): this {
    this.mode = 'maybe';
    return this;
  }

  throwOnError(): this {
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = this.execute();
      return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as TResult1));
    } catch (error) {
      if (onrejected) return Promise.resolve(onrejected(error));
      return Promise.reject(error);
    }
  }

  private execute(): QueryResult {
    const tableRows = this.db.rows(this.table);
    if (this.operation === 'insert') return this.writeInserted(tableRows);
    if (this.operation === 'upsert') return this.writeUpserted(tableRows);
    const matched = this.applyFilters(tableRows);
    if (this.operation === 'update') return this.writeUpdated(matched);
    if (this.operation === 'delete') return this.writeDeleted(matched);
    return this.finish(matched);
  }

  private writeInserted(tableRows: MockRow[]): QueryResult {
    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    const inserted = incoming.map(row => ({
      id: row.id ?? nextMockId(),
      created_at: row.created_at ?? new Date().toISOString(),
      ...row,
    }));
    tableRows.push(...inserted);
    return this.selected ? this.finish(inserted) : { data: null, error: null, count: null };
  }

  private writeUpserted(tableRows: MockRow[]): QueryResult {
    const incoming = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    const keys = this.conflict.split(',').map(key => key.trim());
    const saved: MockRow[] = [];
    incoming.forEach(row => {
      const index = tableRows.findIndex(existing =>
        keys.every(key => existing[key] != null && existing[key] === row[key])
      );
      if (index >= 0) {
        tableRows[index] = { ...tableRows[index], ...row };
        saved.push(tableRows[index]);
      } else {
        const created = {
          id: row.id ?? nextMockId(),
          created_at: new Date().toISOString(),
          ...row,
        };
        tableRows.push(created);
        saved.push(created);
      }
    });
    return this.selected ? this.finish(saved) : { data: null, error: null, count: null };
  }

  private writeUpdated(matched: MockRow[]): QueryResult {
    const changes = (this.payload ?? {}) as MockRow;
    matched.forEach(row => Object.assign(row, changes));
    return this.selected ? this.finish(matched) : { data: null, error: null, count: null };
  }

  private writeDeleted(matched: MockRow[]): QueryResult {
    const ids = new Set(matched.map(row => row.id));
    this.db.tables[this.table] = this.db.rows(this.table).filter(row => !ids.has(row.id));
    return { data: null, error: null, count: null };
  }

  private applyFilters(rows: MockRow[]): MockRow[] {
    return rows.filter(row =>
      this.filters.every(filter => {
        if (filter.column === '__range_from') return true;
        const value = row[filter.column];
        if (filter.kind === 'eq') return value === filter.value;
        if (filter.kind === 'neq') return value !== filter.value;
        if (filter.kind === 'in') return (filter.value as unknown[]).includes(value);
        if (filter.kind === 'is') return value === filter.value;
        if (filter.kind === 'ilike') return matchesIlike(value, filter.value);
        const difference = compare(value, filter.value);
        if (filter.kind === 'gt') return difference > 0;
        if (filter.kind === 'gte') return difference >= 0;
        if (filter.kind === 'lt') return difference < 0;
        return difference <= 0;
      })
    );
  }

  private finish(rows: MockRow[]): QueryResult {
    const sorted = [...rows].sort((left, right) => {
      for (const sort of this.sorts) {
        const difference = compare(left[sort.column], right[sort.column]);
        if (difference !== 0) return sort.ascending ? difference : -difference;
      }
      return 0;
    });
    const limited = this.max == null ? sorted : sorted.slice(0, this.max);
    const count = this.countExact ? rows.length : null;
    if (this.head) return { data: null, error: null, count };
    const projected = limited.map(row => this.project(row, this.table, this.columns));
    if (this.mode === 'many') return { data: projected, error: null, count };
    if (projected.length === 1) return { data: projected[0], error: null, count };
    if (this.mode === 'maybe' && projected.length === 0) return { data: null, error: null, count };
    return {
      data: null,
      error: { message: projected.length === 0 ? 'No rows found.' : 'Multiple rows found.' },
      count,
    };
  }

  private project(row: MockRow, table: string, spec: string): MockRow {
    if (!spec || spec.trim() === '*') return { ...row };
    const result: MockRow = {};
    splitSelect(spec).forEach(part => {
      const nestedStart = part.indexOf('(');
      const rawName = (nestedStart === -1 ? part : part.slice(0, nestedStart)).trim();
      const [alias, relationName] = rawName.includes(':')
        ? rawName.split(':').map(piece => piece.trim())
        : [rawName, rawName];
      const nested = nestedStart === -1 ? null : part.slice(nestedStart + 1, part.lastIndexOf(')'));
      const relation = RELATIONS[table]?.[relationName];
      if (!relation || nested == null) {
        result[alias] = row[alias] ?? row[relationName];
        return;
      }
      const related = this.db.rows(relation.table).filter(candidate => {
        return candidate[relation.toKey] === row[relation.fromKey];
      });
      const projected = related.map(candidate => this.project(candidate, relation.table, nested));
      result[alias] = relation.many ? projected : (projected[0] ?? null);
    });
    return result;
  }
}
