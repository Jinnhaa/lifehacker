const definitions = {
    chief: { name: "Chief", role: "chief", instructions: "Observe user state and provide read-only coordination." },
    project_pm: { name: "Project PM", role: "project_pm", instructions: "Report read-only project status and next actions." }
};
export class AgentBootstrapService {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    async ensureAgentInstance(userId, agentType, requiredScopeId) {
        return this.sql.begin(async (tx) => {
            const scopeRows = requiredScopeId
                ? await tx `select id from public.scopes where id=${requiredScopeId} and user_id=${userId}`
                : await tx `
            select id from public.scopes where user_id=${userId} and kind='global' order by created_at limit 1
          `;
            const scopeId = scopeRows[0]?.id;
            if (!scopeId)
                return null;
            await tx `select pg_advisory_xact_lock(hashtextextended(${`${userId}:${agentType}:${scopeId}`},0))`;
            const active = await tx `
        select i.id,i.template_version,i.home_scope_id from public.agent_instances i
        join public.agent_templates t on t.id=i.agent_template_id and t.user_id=i.user_id
        where i.user_id=${userId} and i.home_scope_id=${scopeId} and i.status='active'
          and t.template_key=${agentType} and t.active=true
        order by i.created_at desc limit 1
      `;
            if (active[0])
                return {
                    id: active[0].id, templateVersion: active[0].template_version, homeScopeId: active[0].home_scope_id
                };
            const definition = definitions[agentType];
            const templates = await tx `
        insert into public.agent_templates(user_id,template_key,version,name,role,instructions,active)
        values(${userId},${agentType},'builtin-v0.1',${definition.name},${definition.role},${definition.instructions},true)
        on conflict(user_id,template_key,version) do update set active=true
        returning id,version
      `;
            const instances = await tx `
        insert into public.agent_instances(user_id,agent_template_id,template_version,name,home_scope_id,status)
        values(${userId},${templates[0].id},${templates[0].version},${definition.name},${scopeId},'active')
        returning id,template_version,home_scope_id
      `;
            return {
                id: instances[0].id,
                templateVersion: instances[0].template_version,
                homeScopeId: instances[0].home_scope_id
            };
        });
    }
}
//# sourceMappingURL=agent-bootstrap.js.map