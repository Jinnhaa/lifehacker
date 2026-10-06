-- Idempotency keys for CourseRecipe materials and semantic MODULE cells.
create unique index learning_materials_course_recipe_action_identity
  on public.learning_materials(
    user_id,
    work_context_id,
    (config->>'presetId'),
    (config->>'presetVersion'),
    (config->>'recipeActionKey')
  )
  where config ? 'presetId' and config ? 'presetVersion' and config ? 'recipeActionKey';

create unique index learning_units_material_scope_identity
  on public.learning_units(user_id,material_id,canonical_topic_key)
  where material_id is not null and canonical_topic_key is not null;

comment on index public.learning_units_material_scope_identity is
  'One semantic scope cell per material; canonical_topic_key is identity and sequence_no remains ordering only.';
