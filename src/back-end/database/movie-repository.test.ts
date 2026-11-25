import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { MovieRecord } from '../types/MovieRecord';
import { initializeSchema } from './schema';
import { getMovieById, getMovies, upsertMovies } from './movie-repository';

describe('movie repository', () => {
  const databases: DatabaseSync[] = [];

  afterEach(() => {
    for (const database of databases) {
      database.close();
    }
    databases.length = 0;
  });

  function createDatabase(): DatabaseSync {
    const database = new DatabaseSync(':memory:');
    initializeSchema(database);
    databases.push(database);
    return database;
  }

  function createMovie(overrides: Partial<MovieRecord> = {}): MovieRecord {
    return {
      id: 1,
      title: 'Movie',
      original_title: 'Original Movie',
      original_language: 'en',
      overview: 'A movie overview.',
      release_date: '2020-01-02',
      popularity: 12.5,
      vote_average: 7.8,
      vote_count: 100,
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      runtime_minutes: 120,
      budget: 1_000_000,
      revenue: 2_000_000,
      collected_at: '2026-11-25T00:00:00.000Z',
      ...overrides,
    };
  }

  it('finds a movie by ID and returns undefined when it does not exist', () => {
    // Arrange: Insert one movie into an in-memory database.
    const database = createDatabase();
    const movie = createMovie();
    upsertMovies(database, [movie]);

    // Act: Look up the stored ID and an unknown ID.
    const foundMovie = getMovieById(database, movie.id);
    const missingMovie = getMovieById(database, 999);

    // Assert: The stored record is returned and missing IDs are undefined.
    expect(foundMovie).toEqual(movie);
    expect(missingMovie).toBeUndefined();
  });

  it('lists movies in ascending identifier order', () => {
    // Arrange: Insert movies in reverse identifier order.
    const database = createDatabase();
    const movies = [
      createMovie({ id: 20, title: 'Second' }),
      createMovie({ id: 10, title: 'First' }),
    ];
    upsertMovies(database, movies);

    // Act: Retrieve the full movie list.
    const listedMovies = getMovies(database);

    // Assert: The result is ordered by ID, not insertion order.
    expect(listedMovies).toEqual([{ ...movies[1] }, { ...movies[0] }]);
  });

  it('inserts new movies and updates existing movies without duplicates', () => {
    // Arrange: Start with one movie and prepare updated values for the same ID.
    const database = createDatabase();
    const movie = createMovie();
    upsertMovies(database, [movie]);
    const updatedMovie = createMovie({
      title: 'Updated Movie',
      overview: 'Updated overview.',
      popularity: 18.2,
      collected_at: '2026-11-25T12:00:00.000Z',
    });

    // Act: Upsert a new record and then update the existing one.
    const insertedCount = upsertMovies(database, [createMovie({ id: 2 })]);
    const updatedCount = upsertMovies(database, [updatedMovie]);

    // Assert: Both operations are counted and the ID has only one current record.
    expect(insertedCount).toBe(1);
    expect(updatedCount).toBe(1);
    expect(getMovieById(database, movie.id)).toEqual(updatedMovie);
    expect(getMovies(database)).toHaveLength(2);
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM movies WHERE id = ?')
        .get(movie.id),
    ).toEqual({ count: 1 });
  });

  it('rolls back all movie changes when an upsert fails', () => {
    // Arrange: Store an existing movie before attempting an invalid batch.
    const database = createDatabase();
    const existingMovie = createMovie();
    upsertMovies(database, [existingMovie]);

    // Act and assert: A null required title aborts and rolls back the batch.
    expect(() =>
      upsertMovies(database, [
        createMovie({ id: 2, title: 'Another Movie' }),
        createMovie({ id: 3, title: null as unknown as string }),
      ]),
    ).toThrow(/NOT NULL constraint failed/);
    expect(getMovies(database)).toEqual([existingMovie]);
  });
});
