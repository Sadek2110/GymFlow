-- AddForeignKey
ALTER TABLE "WorkoutExerciseLog" ADD CONSTRAINT "WorkoutExerciseLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
