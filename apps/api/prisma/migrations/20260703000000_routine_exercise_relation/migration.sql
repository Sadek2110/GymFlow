-- CreateIndex
CREATE INDEX "RoutineDayExercise_exerciseId_idx" ON "RoutineDayExercise"("exerciseId");

-- AddForeignKey
ALTER TABLE "RoutineDayExercise" ADD CONSTRAINT "RoutineDayExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
