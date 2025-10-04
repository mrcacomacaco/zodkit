/**
 * @fileoverview HTML Documentation Generator
 * @module HTMLGenerator
 *
 * Generates styled HTML documentation from Zod schemas with interactive features.
 */

import type { DocNode, DocumentationTree } from './tree';

export interface HTMLOptions {
	/** Page title */
	title?: string;
	/** CSS theme: light, dark, auto */
	theme?: 'light' | 'dark' | 'auto';
	/** Include search functionality */
	includeSearch?: boolean;
	/** Include navigation sidebar */
	includeSidebar?: boolean;
	/** Custom CSS */
	customCSS?: string;
	/** Custom JavaScript */
	customJS?: string;
}

export class HTMLGenerator {
	private readonly options: Required<HTMLOptions>;

	constructor(options: HTMLOptions = {}) {
		this.options = {
			title: 'Schema Documentation',
			theme: 'auto',
			includeSearch: true,
			includeSidebar: true,
			customCSS: '',
			customJS: '',
			...options,
		};
	}

	/**
	 * Generate HTML documentation from documentation tree
	 */
	generate(tree: DocumentationTree): string {
		return `<!DOCTYPE html>
<html lang="en" data-theme="${this.options.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(this.options.title)}</title>
    <style>${this.generateCSS()}</style>
</head>
<body>
    ${this.options.includeSidebar ? this.generateSidebar(tree) : ''}
    <main class="content">
        ${this.generateHeader()}
        ${this.options.includeSearch ? this.generateSearch() : ''}
        ${this.generateContent(tree)}
    </main>
    <script>${this.generateJS(tree)}</script>
</body>
</html>`;
	}

	/**
	 * Generate CSS styles
	 */
	private generateCSS(): string {
		return `
        :root {
            --primary: #3b82f6;
            --background: #ffffff;
            --surface: #f3f4f6;
            --text: #1f2937;
            --text-secondary: #6b7280;
            --border: #e5e7eb;
            --code-bg: #f9fafb;
        }

        [data-theme="dark"] {
            --primary: #60a5fa;
            --background: #111827;
            --surface: #1f2937;
            --text: #f9fafb;
            --text-secondary: #9ca3af;
            --border: #374151;
            --code-bg: #1f2937;
        }

        @media (prefers-color-scheme: dark) {
            [data-theme="auto"] {
                --primary: #60a5fa;
                --background: #111827;
                --surface: #1f2937;
                --text: #f9fafb;
                --text-secondary: #9ca3af;
                --border: #374151;
                --code-bg: #1f2937;
            }
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: var(--background);
            color: var(--text);
            line-height: 1.6;
            display: flex;
        }

        .sidebar {
            width: 280px;
            height: 100vh;
            position: sticky;
            top: 0;
            background: var(--surface);
            border-right: 1px solid var(--border);
            overflow-y: auto;
            padding: 2rem 1.5rem;
        }

        .sidebar h2 {
            font-size: 1.25rem;
            margin-bottom: 1rem;
            color: var(--text);
        }

        .sidebar nav ul {
            list-style: none;
        }

        .sidebar nav li {
            margin: 0.5rem 0;
        }

        .sidebar nav a {
            color: var(--text-secondary);
            text-decoration: none;
            display: block;
            padding: 0.25rem 0.5rem;
            border-radius: 0.375rem;
            transition: all 0.2s;
        }

        .sidebar nav a:hover {
            color: var(--primary);
            background: var(--background);
        }

        .sidebar nav .category {
            font-weight: 600;
            color: var(--text);
            margin-top: 1rem;
        }

        .content {
            flex: 1;
            padding: 2rem 3rem;
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            margin-bottom: 3rem;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }

        .header .date {
            color: var(--text-secondary);
            font-size: 0.875rem;
        }

        .search {
            margin-bottom: 2rem;
        }

        .search input {
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid var(--border);
            border-radius: 0.5rem;
            background: var(--surface);
            color: var(--text);
            font-size: 1rem;
        }

        .search input:focus {
            outline: none;
            border-color: var(--primary);
        }

        .schema {
            margin-bottom: 3rem;
            padding-bottom: 2rem;
            border-bottom: 1px solid var(--border);
        }

        .schema:last-child {
            border-bottom: none;
        }

        .schema h3 {
            font-size: 1.75rem;
            margin-bottom: 0.75rem;
            color: var(--text);
        }

        .schema .description {
            color: var(--text-secondary);
            margin-bottom: 1.5rem;
        }

        .metadata {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        .metadata-item {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.375rem 0.75rem;
            background: var(--surface);
            border-radius: 0.375rem;
            font-size: 0.875rem;
        }

        .metadata-item strong {
            color: var(--text);
        }

        .metadata-item span {
            color: var(--text-secondary);
        }

        .code-block {
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 0.5rem;
            padding: 1rem;
            overflow-x: auto;
            margin: 1rem 0;
        }

        .code-block pre {
            margin: 0;
            font-family: 'Fira Code', 'Consolas', monospace;
            font-size: 0.875rem;
            line-height: 1.5;
        }

        .examples {
            margin: 1.5rem 0;
        }

        .examples h4 {
            font-size: 1.125rem;
            margin-bottom: 0.75rem;
        }

        .example {
            margin-bottom: 1rem;
        }

        .relationships {
            margin: 1.5rem 0;
        }

        .relationships h4 {
            font-size: 1.125rem;
            margin-bottom: 0.75rem;
        }

        .relationships ul {
            list-style: none;
            margin-left: 1rem;
        }

        .relationships li {
            margin: 0.5rem 0;
            color: var(--text-secondary);
        }

        .relationships a {
            color: var(--primary);
            text-decoration: none;
        }

        .relationships a:hover {
            text-decoration: underline;
        }

        .tag {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            background: var(--primary);
            color: white;
            border-radius: 0.25rem;
            font-size: 0.75rem;
            margin-right: 0.5rem;
        }

        .deprecated {
            color: #ef4444;
            background: #fef2f2;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            margin-bottom: 1rem;
            border-left: 3px solid #ef4444;
        }

        [data-theme="dark"] .deprecated {
            background: #7f1d1d;
        }

        @media (max-width: 768px) {
            .sidebar {
                display: none;
            }

            .content {
                padding: 1.5rem;
            }
        }

        ${this.options.customCSS}
        `;
	}

	/**
	 * Generate navigation sidebar
	 */
	private generateSidebar(tree: DocumentationTree): string {
		const nav: string[] = ['<aside class="sidebar">', '<h2>Navigation</h2>', '<nav><ul>'];

		tree.walk((node) => {
			if (node.id === 'root') return undefined;

			const indent = '  '.repeat(node.depth - 1);

			if (node.type === 'category') {
				nav.push(
					`${indent}<li class="category"><a href="#${this.slugify(node.name)}">${this.escapeHtml(node.name)}</a></li>`,
				);
			} else if (node.type === 'schema') {
				nav.push(
					`${indent}<li><a href="#${this.slugify(node.name)}">${this.escapeHtml(node.name)}</a></li>`,
				);
			}
		});

		nav.push('</ul></nav>', '</aside>');
		return nav.join('\n');
	}

	/**
	 * Generate header section
	 */
	private generateHeader(): string {
		return `
        <header class="header">
            <h1>${this.escapeHtml(this.options.title)}</h1>
            <p class="date">Generated on ${new Date().toLocaleDateString()}</p>
        </header>
        `;
	}

	/**
	 * Generate search box
	 */
	private generateSearch(): string {
		return `
        <div class="search">
            <input type="text" id="schema-search" placeholder="Search schemas..." />
        </div>
        `;
	}

	/**
	 * Generate main content
	 */
	private generateContent(tree: DocumentationTree): string {
		const content: string[] = [];
		const root = tree.getRoot();

		this.generateNodeHTML(root, content);

		return content.join('\n');
	}

	/**
	 * Generate HTML for a node and its children
	 */
	private generateNodeHTML(node: DocNode, output: string[]): void {
		if (node.id === 'root') {
			for (const child of node.children) {
				this.generateNodeHTML(child, output);
			}
			return;
		}

		if (node.type === 'category') {
			output.push(`<section id="${this.slugify(node.name)}">`);
			output.push(`<h2>${this.escapeHtml(node.name)}</h2>`);
			if (node.description) {
				output.push(`<p>${this.escapeHtml(node.description)}</p>`);
			}

			for (const child of node.children) {
				this.generateNodeHTML(child, output);
			}

			output.push('</section>');
			return;
		}

		if (node.type === 'schema') {
			output.push(this.generateSchemaHTML(node));
		}
	}

	/**
	 * Generate HTML for a schema node
	 */
	private generateSchemaHTML(node: DocNode): string {
		const parts: string[] = [];

		parts.push(
			`<article class="schema" id="${this.slugify(node.name)}" data-schema="${node.name}">`,
		);
		parts.push(`<h3>${this.escapeHtml(node.name)}</h3>`);

		if (node.description) {
			parts.push(`<p class="description">${this.escapeHtml(node.description)}</p>`);
		}

		// Deprecated warning
		if (node.metadata?.deprecated) {
			const deprecatedMsg =
				typeof node.metadata.deprecated === 'string'
					? node.metadata.deprecated
					: 'This schema is deprecated';
			parts.push(`<div class="deprecated">⚠️ Deprecated: ${this.escapeHtml(deprecatedMsg)}</div>`);
		}

		// Metadata
		if (node.metadata) {
			parts.push(this.generateMetadataHTML(node));
		}

		// Type definition
		if (node.schemaType) {
			parts.push('<div class="code-block">');
			parts.push(`<pre><code>${this.escapeHtml(node.schemaType)}</code></pre>`);
			parts.push('</div>');
		}

		// Examples
		const examples = this.collectExamples(node);
		if (examples.length > 0) {
			parts.push(this.generateExamplesHTML(examples));
		}

		// Relationships
		if (node.relationships.length > 0) {
			parts.push(this.generateRelationshipsHTML(node));
		}

		parts.push('</article>');
		return parts.join('\n');
	}

	/**
	 * Generate metadata HTML
	 */
	private generateMetadataHTML(node: DocNode): string {
		const parts: string[] = ['<div class="metadata">'];
		const meta = node.metadata!;

		if (meta.category) {
			parts.push(
				`<div class="metadata-item"><strong>Category:</strong> <span>${this.escapeHtml(meta.category)}</span></div>`,
			);
		}

		if (meta.version) {
			parts.push(
				`<div class="metadata-item"><strong>Version:</strong> <span>${this.escapeHtml(meta.version)}</span></div>`,
			);
		}

		if (meta.tsDoc?.since) {
			parts.push(
				`<div class="metadata-item"><strong>Since:</strong> <span>${this.escapeHtml(meta.tsDoc.since)}</span></div>`,
			);
		}

		if (meta.tags && meta.tags.length > 0) {
			meta.tags.forEach((tag) => {
				parts.push(`<span class="tag">${this.escapeHtml(tag)}</span>`);
			});
		}

		parts.push('</div>');
		return parts.join('\n');
	}

	/**
	 * Collect examples from node
	 */
	private collectExamples(node: DocNode): any[] {
		const examples: any[] = [];

		if (node.metadata?.examples) {
			examples.push(...node.metadata.examples);
		}

		if (node.metadata?.tsDoc?.examples) {
			examples.push(...node.metadata.tsDoc.examples);
		}

		return examples;
	}

	/**
	 * Generate examples HTML
	 */
	private generateExamplesHTML(examples: any[]): string {
		const parts: string[] = ['<div class="examples">', '<h4>Examples</h4>'];

		examples.forEach((example) => {
			parts.push('<div class="example">');
			parts.push('<div class="code-block">');

			if (typeof example === 'string') {
				parts.push(`<pre><code>${this.escapeHtml(example)}</code></pre>`);
			} else {
				parts.push(`<pre><code>${this.escapeHtml(JSON.stringify(example, null, 2))}</code></pre>`);
			}

			parts.push('</div>');
			parts.push('</div>');
		});

		parts.push('</div>');
		return parts.join('\n');
	}

	/**
	 * Generate relationships HTML
	 */
	private generateRelationshipsHTML(node: DocNode): string {
		const parts: string[] = ['<div class="relationships">', '<h4>Relationships</h4>', '<ul>'];

		node.relationships.forEach((rel) => {
			const targetName = rel.targetId.split('-').pop() || rel.targetId;
			parts.push(
				`<li><strong>${rel.type}:</strong> <a href="#${this.slugify(targetName)}">${this.escapeHtml(targetName)}</a>${rel.description ? ` - ${this.escapeHtml(rel.description)}` : ''}</li>`,
			);
		});

		parts.push('</ul>', '</div>');
		return parts.join('\n');
	}

	/**
	 * Generate JavaScript for interactivity
	 */
	private generateJS(tree: DocumentationTree): string {
		const schemas = tree.getSchemas().map((n) => ({
			name: n.name,
			description: n.description || '',
			id: this.slugify(n.name),
		}));

		return `
        // Search functionality
        const searchInput = document.getElementById('schema-search');
        const schemas = ${JSON.stringify(schemas)};

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const schemaElements = document.querySelectorAll('.schema');

                schemaElements.forEach(el => {
                    const schemaName = el.dataset.schema.toLowerCase();
                    const visible = schemaName.includes(query);
                    el.style.display = visible ? 'block' : 'none';
                });
            });
        }

        // Smooth scroll to anchors
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        ${this.options.customJS}
        `;
	}

	/**
	 * Escape HTML special characters
	 */
	private escapeHtml(text: string): string {
		const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;',
		};
		return text.replace(/[&<>"']/g, (m) => map[m]);
	}

	/**
	 * Convert text to slug
	 */
	private slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
	}
}

/**
 * Generate HTML documentation from documentation tree
 */
export function generateHTML(tree: DocumentationTree, options?: HTMLOptions): string {
	const generator = new HTMLGenerator(options);
	return generator.generate(tree);
}
