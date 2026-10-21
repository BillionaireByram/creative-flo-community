# Creative Flo agent skill

This directory contains the self-hosted feedback-loop skill shipped with Creative Flo.
Install or link `skills/creative-flo/` in the Claude Code environment that runs the edit engine.

The skill polls the review API for requested work, applies timecoded comments with the engine,
uploads a new version, and replies to and resolves the handled comments. It does not require
private hosts, social-posting accounts, or outbound webhooks.
