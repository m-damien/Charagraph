module.exports = {
    "env": {
        "browser": true,
        "es2021": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:react/recommended",
        "plugin:@typescript-eslint/recommended"
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaFeatures": {
            "jsx": true
        },
        "ecmaVersion": 12,
        "sourceType": "module"
    },
    "plugins": [
        "react",
        "@typescript-eslint"
    ],
    "rules": {
        "react/prop-types": "off",
        "no-prototype-builtins": "off",
        //"no-var": "off",
        //"no-use-before-define": "off",
        '@typescript-eslint/no-var-requires': "off",
        "prefer-rest-params": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/no-extra-semi": "off",
        "@typescript-eslint/no-this-alias": [
            "error",
            {
              "allowedNames": ["self"]
            }
          ]
    }
};
