audience: developers
level: patch
---
Drop `yarn minify` from our commands. It's been broken for 3 years without
anyone complaining. To minify lockfiles, use the builtin `yarn dedupe` instead.
