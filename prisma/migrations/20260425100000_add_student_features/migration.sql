-- Add unread flag to classroom_access
ALTER TABLE "classroom_access" ADD COLUMN "unread_assignment" BOOLEAN NOT NULL DEFAULT true;

-- Scene progress tracking
CREATE TABLE "scene_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "last_viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scene_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scene_progress_user_id_classroom_id_scene_id_key" ON "scene_progress"("user_id", "classroom_id", "scene_id");
CREATE INDEX "scene_progress_user_id_classroom_id_idx" ON "scene_progress"("user_id", "classroom_id");
ALTER TABLE "scene_progress" ADD CONSTRAINT "scene_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PBL session transcripts
CREATE TABLE "pbl_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "scene_id" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pbl_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pbl_sessions_user_id_classroom_id_scene_id_key" ON "pbl_sessions"("user_id", "classroom_id", "scene_id");
CREATE INDEX "pbl_sessions_user_id_classroom_id_idx" ON "pbl_sessions"("user_id", "classroom_id");
ALTER TABLE "pbl_sessions" ADD CONSTRAINT "pbl_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
