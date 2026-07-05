/**
 * Mock de PrismaService para tests unitarios (fuera del árbol de producción).
 * Cada método de modelo usado por los servicios es un jest.fn() configurable.
 */
export type PrismaMock = ReturnType<typeof createPrismaMock>;

function model() {
  return {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  };
}

export function createPrismaMock() {
  const mock = {
    user: model(),
    userProfile: model(),
    bodyMeasurement: model(),
    refreshToken: model(),
    passwordResetToken: model(),
    gymCredential: model(),
    exercise: model(),
    routine: model(),
    routineDay: model(),
    routineDayExercise: model(),
    workoutSession: model(),
    workoutExerciseLog: model(),
    reservation: model(),
    $transaction: jest.fn(),
  };

  // Por defecto, $transaction ejecuta el callback con el propio mock,
  // o resuelve el array de promesas que reciba.
  mock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof mock) => unknown)(mock);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return undefined;
  });

  return mock;
}
