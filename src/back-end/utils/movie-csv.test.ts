import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { upsertMovies } from '../database/movie-repository';
import { initializeSchema } from '../database/schema';
import { parseMoviesCsv } from './movie-csv';

describe('parseMoviesCsv', () => {
  it('parses movie records with reordered headers, optional values, and quoted fields', () => {
    // Arrange: Use reordered headers, a BOM, a quoted comma, and an empty optional value.
    const csv =
      '\uFEFFTITLE,id,original_title,original_language,overview,collected_at,popularity,release_date,vote_average,vote_count,runtime_minutes,budget,revenue\n' +
      '"A, Movie",11,Original,en,"An overview",2026-11-25T00:00:00.000Z,12.5,2020-05-01,8.2,100,120,1000000,2000000\n';

    // Act
    const movies = parseMoviesCsv(csv);

    // Assert: Values are mapped by header and omitted fields become null.
    expect(movies).toEqual([
      {
        id: 11,
        title: 'A, Movie',
        original_title: 'Original',
        original_language: 'en',
        overview: 'An overview',
        collected_at: '2026-11-25T00:00:00.000Z',
        release_date: '2020-05-01',
        popularity: 12.5,
        vote_average: 8.2,
        vote_count: 100,
        poster_path: null,
        backdrop_path: null,
        runtime_minutes: 120,
        budget: 1_000_000,
        revenue: 2_000_000,
      },
    ]);
  });

  it('rejects missing, duplicate, or unsupported headers', () => {
    // Arrange: Prepare CSV documents with invalid header rows.
    const invalidCsvDocuments = [
      '',
      'id,title\n11,Movie',
      'id,id,title,original_title,original_language,overview,collected_at\n11,11,Movie,Movie,en,,now',
      'id,title,original_title,original_language,overview,collected_at,extra\n11,Movie,Movie,en,,now,value',
    ];

    // Act and assert: Every malformed header is reported as an invalid movie CSV.
    for (const csv of invalidCsvDocuments) {
      expect(() => parseMoviesCsv(csv)).toThrow(/Movies CSV/);
    }
  });

  it('rejects invalid identifiers, required fields, and numeric values', () => {
    // Arrange: Prepare rows that violate the importer’s field validation.
    const header =
      'id,title,original_title,original_language,overview,collected_at,popularity,vote_count,runtime_minutes';
    const invalidCsvDocuments = [
      `${header}\n0,Movie,Movie,en,,now,,,`,
      `${header}\n1.5,Movie,Movie,en,,now,,,`,
      `${header}\n9007199254740992,Movie,Movie,en,,now,,,`,
      `${header}\n11,,Movie,en,,now,,,`,
      `${header}\n11,Movie,Movie,en,,now,not-a-number,,`,
      `${header}\n11,Movie,Movie,en,,now,1e999,,`,
      `${header}\n11,Movie,Movie,en,,now,,1.5,`,
      `${header}\n11,Movie,Movie,en,,now,,invalid,`,
      `${header}\n11,Movie,Movie,en,,now,,-1,`,
      `${header}\n11,Movie,Movie,en,,now,,,invalid`,
      `${header}\n11,Movie,Movie,en,,now,,,0`,
    ];

    // Act and assert: Invalid data is rejected with a row-level validation error.
    for (const csv of invalidCsvDocuments) {
      expect(() => parseMoviesCsv(csv)).toThrow(/Invalid movie/);
    }
  });

  it('imports CSV records and updates a stored movie on a later import', () => {
    // Arrange: Parse two snapshots of the same movie and initialize an in-memory database.
    const initialMovie = parseMoviesCsv(
      'id,title,original_title,original_language,overview,collected_at\n' +
        '11,Movie,Original,en,First overview,2026-11-25T00:00:00.000Z\n',
    );
    const updatedMovie = parseMoviesCsv(
      'id,title,original_title,original_language,overview,collected_at\n' +
        '11,Updated Movie,Original,en,Updated overview,2026-11-26T00:00:00.000Z\n',
    );
    const database = new DatabaseSync(':memory:');
    initializeSchema(database);

    try {
      // Act: Import the initial row, then import an updated row with the same ID.
      expect(upsertMovies(database, initialMovie)).toBe(1);
      expect(upsertMovies(database, updatedMovie)).toBe(1);

      // Assert: The CSV values replace the existing record without adding a duplicate.
      expect(
        database
          .prepare(
            'SELECT id, title, overview, collected_at FROM movies WHERE id = ?',
          )
          .get(11),
      ).toEqual({
        id: 11,
        title: 'Updated Movie',
        overview: 'Updated overview',
        collected_at: '2026-11-26T00:00:00.000Z',
      });
      expect(() =>
        upsertMovies(database, [
          { ...updatedMovie[0], title: null as unknown as string },
        ]),
      ).toThrow(/NOT NULL constraint failed/);
      expect(
        database.prepare('SELECT title FROM movies WHERE id = ?').get(11),
      ).toEqual({ title: 'Updated Movie' });
      expect(
        database.prepare('SELECT COUNT(*) AS count FROM movies').get(),
      ).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });
});
