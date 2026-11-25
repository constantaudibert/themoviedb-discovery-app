import { parse } from 'csv-parse/sync';
import type { MovieRecord } from '../types/MovieRecord';

const REQUIRED_HEADERS = [
  'id',
  'title',
  'original_title',
  'original_language',
  'overview',
  'collected_at',
] as const;

const OPTIONAL_HEADERS = [
  'release_date',
  'popularity',
  'vote_average',
  'vote_count',
  'poster_path',
  'backdrop_path',
  'runtime_minutes',
  'budget',
  'revenue',
] as const;

const ALLOWED_HEADERS = new Set<string>([
  ...REQUIRED_HEADERS,
  ...OPTIONAL_HEADERS,
]);

/**
 * Parses and validates a movie CSV document.
 */
export function parseMoviesCsv(csv: string): MovieRecord[] {
  const rows = parse(csv, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as unknown[][];

  if (rows.length === 0) {
    throw new Error('Movies CSV must contain a header row');
  }

  const headers = rows[0].map((header) => String(header).trim().toLowerCase());
  if (
    new Set(headers).size !== headers.length ||
    headers.some((header) => !ALLOWED_HEADERS.has(header)) ||
    REQUIRED_HEADERS.some((header) => !headers.includes(header))
  ) {
    throw new Error(
      'Movies CSV headers must include required movie fields and only supported columns',
    );
  }

  const indexes = new Map(headers.map((header, index) => [header, index]));

  return rows.slice(1).map((row, rowIndex) => {
    const csvRow = rowIndex + 2;
    const value = (header: string): string => {
      const index = indexes.get(header);
      return index === undefined ? '' : String(row[index]).trim();
    };
    const requiredText = (header: string): string => {
      const text = value(header);
      if (text.length === 0) {
        throw new Error(
          `Invalid movie at CSV row ${csvRow}: ${header} must not be empty`,
        );
      }
      return text;
    };

    const id = parseInteger(value('id'), 'id', csvRow);

    return {
      id,
      title: requiredText('title'),
      original_title: requiredText('original_title'),
      original_language: requiredText('original_language'),
      overview: value('overview'),
      release_date: nullableText(value('release_date')),
      popularity: nullableNumber(value('popularity'), 'popularity', csvRow),
      vote_average: nullableNumber(
        value('vote_average'),
        'vote_average',
        csvRow,
      ),
      vote_count: nullableInteger(value('vote_count'), 'vote_count', csvRow),
      poster_path: nullableText(value('poster_path')),
      backdrop_path: nullableText(value('backdrop_path')),
      runtime_minutes: nullableInteger(
        value('runtime_minutes'),
        'runtime_minutes',
        csvRow,
        true,
      ),
      budget: nullableInteger(value('budget'), 'budget', csvRow, true),
      revenue: nullableInteger(value('revenue'), 'revenue', csvRow, true),
      collected_at: requiredText('collected_at'),
    };
  });
}

function nullableText(value: string): string | null {
  return value.length > 0 ? value : null;
}

function nullableNumber(
  value: string,
  column: string,
  row: number,
): number | null {
  if (value.length === 0) return null;

  if (!isNumericValue(value)) {
    throw new Error(
      `Invalid movie ${column} at CSV row ${row}: expected a finite number`,
    );
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(
      `Invalid movie ${column} at CSV row ${row}: expected a finite number`,
    );
  }
  return number;
}

function nullableInteger(
  value: string,
  column: string,
  row: number,
  mustBePositive = false,
): number | null {
  if (value.length === 0) return null;

  if (!isNumericValue(value)) {
    const constraint = mustBePositive
      ? 'a positive safe integer'
      : 'a non-negative safe integer';
    throw new Error(
      `Invalid movie ${column} at CSV row ${row}: expected ${constraint}`,
    );
  }
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    (mustBePositive && number <= 0) ||
    (!mustBePositive && number < 0)
  ) {
    const constraint = mustBePositive
      ? 'a positive safe integer'
      : 'a non-negative safe integer';
    throw new Error(
      `Invalid movie ${column} at CSV row ${row}: expected ${constraint}`,
    );
  }
  return number;
}

function isNumericValue(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);
}

function parseInteger(value: string, column: string, row: number): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(
      `Invalid movie ${column} at CSV row ${row}: expected a positive integer`,
    );
  }

  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(
      `Invalid movie ${column} at CSV row ${row}: expected a positive safe integer`,
    );
  }
  return number;
}
