-- GOLF Magazine's Top 100 Courses in the World, 2025-26 (published 2025-11-19),
-- as ranking type 'global' (shown as "World"; decision 2026-09-30-whole-world-top-100-from-golf-magazine).
-- Source: https://golf.com/travel/courses/top-100-courses-world-2025-26/
-- Extracted and checked against the page's tables and structured list on 2026-09-30.
--
-- Courses: 97 are existing catalog rows (fixed ids from 0001_seed_catalog). Where the
-- catalog has a course twice, one row with the USA rank and one with the state rank
-- (legacy duplicates), GOLF's rank goes on the row with the USA rank. The other
-- three are added unless a course with the same name key and country already exists
-- (a member may have added one by hand), in which case that row is ranked.
--
-- Postgres cannot use an enum value added by ALTER TYPE ... ADD VALUE in the transaction
-- that added it, and drizzle applies pending migrations in one transaction, so the
-- type is recreated with the new value instead.
ALTER TYPE "public"."ranking_type" RENAME TO "ranking_type_old";--> statement-breakpoint
CREATE TYPE "public"."ranking_type" AS ENUM('world', 'usa', 'usa_public', 'state', 'global');--> statement-breakpoint
ALTER TABLE "course_rankings" ALTER COLUMN "ranking_type" SET DATA TYPE "public"."ranking_type" USING "ranking_type"::text::"public"."ranking_type";--> statement-breakpoint
DROP TYPE "public"."ranking_type_old";--> statement-breakpoint
INSERT INTO courses (id, name, name_key, city, state, country, is_custom)
SELECT '597f7b62-1d9b-46ec-94d0-52514081aca1', 'Ardfin', 'ardfin', 'Isle of Jura', NULL, 'Scotland', false
WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name_key = 'ardfin' AND country = 'Scotland');--> statement-breakpoint
INSERT INTO course_rankings (course_id, ranking_type, rank, scope_code, source, source_year, source_url)
SELECT id, 'global', 72, 'GLOBAL', 'GOLF Magazine', 2025, 'https://golf.com/travel/courses/top-100-courses-world-2025-26/' FROM courses
WHERE name_key = 'ardfin' AND country = 'Scotland' ORDER BY is_custom, created_at, id LIMIT 1;--> statement-breakpoint
INSERT INTO courses (id, name, name_key, city, state, country, is_custom)
SELECT '8df5585d-edf5-45fa-838b-ae49e84e49cd', 'Childress Hall (Upper)', 'childress hall upper', 'Childress', 'TX', 'USA', false
WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name_key = 'childress hall upper' AND country = 'USA');--> statement-breakpoint
INSERT INTO course_rankings (course_id, ranking_type, rank, scope_code, source, source_year, source_url)
SELECT id, 'global', 73, 'GLOBAL', 'GOLF Magazine', 2025, 'https://golf.com/travel/courses/top-100-courses-world-2025-26/' FROM courses
WHERE name_key = 'childress hall upper' AND country = 'USA' ORDER BY is_custom, created_at, id LIMIT 1;--> statement-breakpoint
INSERT INTO courses (id, name, name_key, city, state, country, is_custom)
SELECT 'd514fa5f-1fa8-4bc2-a934-4967abbb2d1f', 'Nine Bridges', 'nine bridges', NULL, 'Jeju-do', 'South Korea', false
WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name_key = 'nine bridges' AND country = 'South Korea');--> statement-breakpoint
INSERT INTO course_rankings (course_id, ranking_type, rank, scope_code, source, source_year, source_url)
SELECT id, 'global', 87, 'GLOBAL', 'GOLF Magazine', 2025, 'https://golf.com/travel/courses/top-100-courses-world-2025-26/' FROM courses
WHERE name_key = 'nine bridges' AND country = 'South Korea' ORDER BY is_custom, created_at, id LIMIT 1;--> statement-breakpoint
INSERT INTO course_rankings (course_id, ranking_type, rank, scope_code, source, source_year, source_url)
SELECT v.course_id::uuid, 'global', v.rank, 'GLOBAL', 'GOLF Magazine', 2025, 'https://golf.com/travel/courses/top-100-courses-world-2025-26/' FROM (VALUES
  ('c39bc937-9250-426d-9bfc-caa75cc0c0d2', 1),
  ('2d09ffa8-9f36-48fc-a984-90f392b2eb80', 2),
  ('27518719-dc92-4858-92bc-71eb46efd92d', 3),
  ('aecb12b7-e50c-44b8-866e-5eb68f936d25', 4),
  ('a2c28597-2105-4fd3-9ff4-dc11cced930a', 5),
  ('9e7ddf6b-8685-4f13-9da1-4eaef88f0234', 6),
  ('e14363a1-4823-48bd-8098-abc4aaf2126d', 7),
  ('a3a9ca55-5b59-45b2-9e88-397e1fa1dc97', 8),
  ('9fbe7632-c43a-4612-87d9-e4ac2c975b57', 9),
  ('42fbe050-ef71-42ca-a89b-145325624d4d', 10),
  ('5beb362f-5314-4648-b5d6-61e80f22f677', 11),
  ('fe2f2a62-6a5b-464d-b57f-075bbc7df479', 12),
  ('2e383ceb-d99d-40df-9f82-d2ee3756d262', 13),
  ('03ed8c8c-bd64-42f9-8842-dfffd5697cd2', 14),
  ('1abc5e16-63b6-47a7-9cbf-92c3091fab70', 15),
  ('365cf78d-8ce7-406c-a91a-447a60ce4363', 16),
  ('3d03e70a-a4c9-4a6b-8484-e2daf2c4686a', 17),
  ('5c34e0b8-8476-4685-b4ea-7166416d0565', 18),
  ('51d56ebf-100c-45d9-b164-1f0e66a4b9ad', 19),
  ('70fb1441-1455-46f1-a2bc-cc4bb68243a8', 20),
  ('4b401c17-a33b-40d6-aa67-f14e86281d31', 21),
  ('b34d17b3-0d21-4c0b-8bef-368a700cc4d9', 22),
  ('debec220-0bec-402a-99d0-266feb60982c', 23),
  ('62d2e9d5-4676-47c3-9f2f-1b9bb418d734', 24),
  ('1b77bbec-e05f-400f-ae14-5c305da300ad', 25),
  ('a581e4f8-5c2d-4458-96ae-aaa381624813', 26),
  ('f22aa995-960d-4f85-9e18-34975cccc8ac', 27),
  ('f2447f22-3c42-4226-88c6-bbd1023c97ec', 28),
  ('fe6c711a-8286-492f-80e7-847d3349ffee', 29),
  ('6523c9e3-750b-4b92-abd5-b3de66ae2863', 30),
  ('9f5f1ade-93bf-4a8c-8cf9-4a384345a653', 31),
  ('01dff83c-fe59-490b-ab79-3693b3f5d37c', 32),
  ('0004a482-9636-4602-9132-08a94513d6ec', 33),
  ('14a46410-6c6f-4f9a-9bb4-4f6827a5156f', 34),
  ('77dea08f-283d-405b-8d87-dd4adce2f797', 35),
  ('68c68d6a-c4a4-4d21-a35d-9b00d075d612', 36),
  ('f2ab0b8b-955f-4d9e-91fc-4928c6818fb9', 37),
  ('0a08b136-99dd-4b8f-a542-a401f1446b1f', 38),
  ('0813eaca-554f-457a-b1b2-3c7f0652758e', 39),
  ('263eb183-1f1c-4afc-8979-2a286a6e61f6', 40),
  ('ec375c46-17b6-439f-ab5b-3caa5a8def2c', 41),
  ('c06fefcf-7918-4cb7-93f1-5b4dcdea9fcc', 42),
  ('6fc2d514-9e51-4d57-84f6-8d3a0e95ed9d', 43),
  ('1eb3f9fc-98af-453d-a8e1-e7d990e6a3a6', 44),
  ('66bcb6cc-0d4c-46df-a303-18e1b3120d3a', 45),
  ('6274084b-374b-41ad-84b8-7353b279a5ac', 46),
  ('810ae28f-c8d5-478f-b14f-724571f19ff8', 47),
  ('4fe70e40-c3c7-42f7-b7e4-82edb5229772', 48),
  ('acf7b709-961f-453f-983d-6f8ab561b32e', 49),
  ('3fb20428-4805-497e-8d07-e4d194208d15', 50),
  ('10a94c3c-f72a-482e-b474-fa943fe56c51', 51),
  ('f8289715-14ab-42d3-8cd7-1e551e89262d', 52),
  ('795d9fa9-522f-4b31-9e76-661e95b83e68', 53),
  ('b375cc2a-82e6-47d7-9867-02bb5b7e5a81', 54),
  ('4a867272-16ed-450e-a482-f27aa4098883', 55),
  ('07301426-1dca-4708-b8bc-f679ac18f73e', 56),
  ('f39a76c4-4f91-5df6-b7bb-b5d05a423bfa', 57),
  ('f7a4ba45-822a-46a1-a447-b2bc64336a79', 58),
  ('36178b32-c05f-46c0-8260-07e92fe18446', 59),
  ('3cd4dc48-7cfe-4dc2-b82c-ee4b503b0a08', 60),
  ('3b5e17b8-4bd4-4d9f-a531-b1b4082363cb', 61),
  ('d4575894-e270-489f-80fc-429ba3858528', 62),
  ('4f9d15c7-2f47-4597-8120-5a4ac09dd017', 63),
  ('3d1e1e12-c0f2-4fe8-998a-9d80d9848f8f', 64),
  ('daeb65ae-2f91-4a60-893f-ec8dffd1f873', 65),
  ('ac1e6fa8-1a02-4736-99e0-a0001acfd5f7', 66),
  ('03308a33-603e-4d34-8015-643c6476d802', 67),
  ('5bfc1d45-b511-4d2f-9270-98cd7845a2ab', 68),
  ('bf6e8384-7bd1-59de-afd5-041600a3182f', 69),
  ('202a0ad6-c66d-4541-8356-b8dd3cc48d31', 70),
  ('d6937dc0-0adf-4ead-834e-b4f78cbd337c', 71),
  ('651b0f28-7949-4e59-91ef-86762725ade6', 74),
  ('6c262f35-f917-4b53-b22b-34c568f8ac64', 75),
  ('76255922-7cea-4771-b2dd-edd8c23ccd58', 76),
  ('f659f34a-9750-4ba4-a37f-cd9147bab77a', 77),
  ('2f1d6f19-ccd6-4147-b6c1-131c0837f53d', 78),
  ('e7c0db63-9303-4b49-8657-897e615d2ddd', 79),
  ('31b40e73-750e-47b0-882e-e80e24be6418', 80),
  ('4b9c95d8-e1d8-4ca0-b2fe-13d8479fb5ec', 81),
  ('f8f52fc4-889e-4efd-883e-bd407350a1e0', 82),
  ('bdca0802-c26c-439b-86c5-b321a9762146', 83),
  ('c43400fd-5286-4f19-ae8f-56160cafbf05', 84),
  ('62006e67-161e-4be0-b958-2409c55f9388', 85),
  ('77f5df1d-5d42-4e06-a43e-4c2872835dc9', 86),
  ('7bdd4f59-6782-443b-9316-d7cd615104ab', 88),
  ('4a8afb0d-160a-42ec-b878-7d9fb2310d7f', 89),
  ('97da66b8-42f2-4bc7-b003-ac47a66f8bbf', 90),
  ('794dad39-54b6-460b-9dfb-efccd76abc96', 91),
  ('7649a652-52f9-4380-82bf-7152e1e79462', 92),
  ('157f59f7-bc2a-4317-b371-b9fcc81c75bc', 93),
  ('359a08fa-773d-4817-ab62-6d721d9f4534', 94),
  ('c337e0b6-d051-422a-8ba4-601ab21c6ae9', 95),
  ('6f29ee53-c5fa-48a0-b443-213aebe016e4', 96),
  ('838f1439-a852-4dba-be44-a4fd6f5e44d1', 97),
  ('6e674f1f-8c39-44e0-923a-481ece2391c3', 98),
  ('cde28b5e-09ab-4a17-8bef-288319da35bb', 99),
  ('436dea20-722e-4ea4-bc72-57bf452af70d', 100)
) AS v(course_id, rank);
