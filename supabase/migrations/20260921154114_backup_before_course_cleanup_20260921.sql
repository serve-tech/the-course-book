
CREATE TABLE IF NOT EXISTS public.course_cleanup_backup_20260921 AS SELECT * FROM public.courses;
CREATE TABLE IF NOT EXISTS public.user_courses_cleanup_backup_20260921 AS SELECT * FROM public.user_courses;
CREATE TABLE IF NOT EXISTS public.rounds_cleanup_backup_20260921 AS SELECT * FROM public.rounds;
CREATE TABLE IF NOT EXISTS public.course_rankings_cleanup_backup_20260921 AS SELECT * FROM public.course_rankings;
