/**
 * GET /api/erd
 *
 * Fetches the live database schema from the central-server's /api/schema
 * endpoint and returns a Mermaid erDiagram string for the ERD page.
 *
 * All DB access goes through the central-server — no direct DB connection here.
 */
import { NextResponse } from 'next/server';
import { upstreamJson, UpstreamError } from '@/lib/api/client';

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface FkRow {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

interface SchemaResponse {
  columns: ColumnRow[];
  foreign_keys: FkRow[];
}

/** Map PostgreSQL types to compact Mermaid-friendly labels. */
function shortType(pgType: string): string {
  const map: Record<string, string> = {
    'character varying': 'VARCHAR',
    'character': 'CHAR',
    'text': 'TEXT',
    'integer': 'INT',
    'bigint': 'BIGINT',
    'smallint': 'SMALLINT',
    'numeric': 'NUMERIC',
    'real': 'REAL',
    'double precision': 'FLOAT',
    'boolean': 'BOOL',
    'uuid': 'UUID',
    'jsonb': 'JSONB',
    'json': 'JSON',
    'timestamp with time zone': 'TIMESTAMPTZ',
    'timestamp without time zone': 'TIMESTAMP',
    'date': 'DATE',
    'inet': 'INET',
    'bytea': 'BYTEA',
  };
  return map[pgType] ?? pgType.toUpperCase();
}

export async function GET() {
  try {
    // Fetch schema from central-server — it queries information_schema directly.
    const { columns, foreign_keys } = await upstreamJson<SchemaResponse>('/api/schema');

    // ── Group columns by table ───────────────────────────────────────────────
    const tables = new Map<string, ColumnRow[]>();
    for (const row of columns) {
      if (!tables.has(row.table_name)) tables.set(row.table_name, []);
      tables.get(row.table_name)!.push(row);
    }

    // ── Build Mermaid erDiagram ──────────────────────────────────────────────
    const lines: string[] = ['erDiagram'];

    // Entity definitions
    for (const [table, cols] of tables) {
      lines.push(`  ${table} {`);
      for (const col of cols) {
        const nullable = col.is_nullable === 'YES' ? '' : ' PK';
        lines.push(`    ${shortType(col.data_type)} ${col.column_name}${nullable}`);
      }
      lines.push('  }');
    }

    // Relationships (deduplicated — one line per table pair)
    const seen = new Set<string>();
    for (const fk of foreign_keys) {
      const key = `${fk.from_table}||${fk.to_table}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${fk.to_table} ||--o{ ${fk.from_table} : "${fk.from_column}"`);
    }

    return NextResponse.json({ mermaid: lines.join('\n'), tableCount: tables.size });
  } catch (err) {
    console.error('[ERD] schema fetch error:', err);
    const status = err instanceof UpstreamError ? err.status : 500;
    return NextResponse.json(
      { error: 'Failed to read database schema', detail: String(err) },
      { status },
    );
  }
}
