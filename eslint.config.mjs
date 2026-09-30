import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
import a11y from 'eslint-plugin-jsx-a11y'
import next from '@next/eslint-plugin-next'

// Incremental safety gate, not a repository-wide stylistic rewrite.
export default [{ignores:['node_modules/**','.next*/**','var/**','backups/**','public/**']},{plugins:{'@next/next':next},rules:{'@next/next/no-head-element':'error'}},{
 files:['src/**/*.{ts,tsx}','scripts/admin-upgrade-*.ts'],
 languageOptions:{parser:tseslint.parser,parserOptions:{ecmaFeatures:{jsx:true},sourceType:'module'}},
 plugins:{'react-hooks':hooks,'jsx-a11y':a11y},
 rules:{'no-dupe-args':'error','no-dupe-keys':'error','no-duplicate-case':'error','no-unexpected-multiline':'error','no-unreachable':'error','react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','jsx-a11y/alt-text':'error','jsx-a11y/aria-props':'error','jsx-a11y/aria-proptypes':'error','jsx-a11y/aria-unsupported-elements':'error'}
}]
