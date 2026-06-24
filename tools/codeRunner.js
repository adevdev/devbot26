/**
 * Code Runner Tool - Execute code in multiple programming languages
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'run_code',
        description: 'Execute code in multiple programming languages (JavaScript/NodeJS, Python, PHP, C, Lua, Ruby). Use this ONCE when user asks to run/execute/test code. Return the output or error directly to user - do NOT refine or re-run the code. The execution result is final.',
        input_schema: {
            type: 'object',
            properties: {
                language: {
                    type: 'string',
                    description: 'Programming language to use. Options: "javascript" (or "nodejs", "js"), "python" (or "py"), "php", "c", "lua", "ruby" (or "rb")',
                    enum: ['javascript', 'nodejs', 'js', 'python', 'py', 'php', 'c', 'lua', 'ruby', 'rb']
                },
                code: {
                    type: 'string',
                    description: 'The complete code to execute. Use the EXACT code provided by user, do not modify it.'
                }
            },
            required: ['language', 'code']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '💻',
        progressMessage: (input) => {
            const langMap = {
                javascript: 'JavaScript',
                nodejs: 'NodeJS',
                js: 'JavaScript',
                python: 'Python',
                py: 'Python',
                php: 'PHP',
                c: 'C',
                lua: 'Lua',
                ruby: 'Ruby',
                rb: 'Ruby'
            };
            const displayLang = langMap[input.language] || input.language;
            return `Executing ${displayLang} code...`;
        },
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        const { language, code } = input;

        // Normalize language name to API format
        const languageMap = {
            'javascript': 'nodejs',
            'nodejs': 'nodejs',
            'js': 'nodejs',
            'python': 'python',
            'py': 'python',
            'php': 'php',
            'c': 'c',
            'lua': 'lua',
            'ruby': 'ruby',
            'rb': 'ruby'
        };

        const normalizedLang = languageMap[language.toLowerCase()];

        if (!normalizedLang) {
            return JSON.stringify({
                success: false,
                error: `Unsupported language: ${language}. Supported: javascript, python, php, c, lua, ruby`
            });
        }

        console.log(`[CodeRunner] Executing ${normalizedLang} code (${code.length} chars)`);

        try {
            // Build request for compiler API
            const body = {
                language: normalizedLang,
                code: code
            };

            const response = await fetch('https://apied26.adevdev.com/compiler', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30000) // 30s timeout for code execution
            });

            if (!response.ok) {
                console.error(`[CodeRunner] API returned HTTP ${response.status}`);
                return JSON.stringify({
                    success: false,
                    error: `Compiler API error: HTTP ${response.status}`
                });
            }

            const result = await response.json();

            if (!result.success) {
                console.log(`[CodeRunner] Compilation failed: ${result.error}`);
                return JSON.stringify({
                    success: false,
                    error: result.error || 'Compilation failed',
                    language: normalizedLang
                });
            }

            // Return successful execution result
            console.log(`[CodeRunner] Execution successful (${result.output?.length || 0} chars output)`);
            return JSON.stringify({
                success: true,
                output: result.output || '(no output)',
                language: normalizedLang
            });

        } catch (error) {
            console.error('[CodeRunner] Error:', error.message);

            if (error.name === 'AbortError') {
                return JSON.stringify({
                    success: false,
                    error: 'Code execution timeout (30s limit exceeded)',
                    language: normalizedLang
                });
            }

            return JSON.stringify({
                success: false,
                error: error.message,
                language: normalizedLang
            });
        }
    }
};
