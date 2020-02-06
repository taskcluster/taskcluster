#!/bin/bash -eu
cd "$(dirname "${0}")"
VALID_FORMAT='[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'
TEMP_GW_HELP="$(mktemp -t generic-worker-help-text.XXXXXXXXXX)"
TEMP_GW_README="$(mktemp -t generic-worker-readme.XXXXXXXXXX)"
TEMP_GW_BINARY="$(mktemp -t generic-worker.XXXXXXXXXX)"
go build -o "${TEMP_GW_BINARY}" -tags multiuser
"${TEMP_GW_BINARY}" --help > "${TEMP_GW_HELP}"
echo '```' >> "${TEMP_GW_HELP}"
sed -e "
   /^generic-worker (multiuser engine) ${VALID_FORMAT}/,/^\`\`\`\$/!b
   //!d
   /^generic-worker (multiuser engine) ${VALID_FORMAT}/d;r ${TEMP_GW_HELP}
   /^\`\`\`\$/d
" README.md > "${TEMP_GW_README}"
cat "${TEMP_GW_README}" > README.md
rm "${TEMP_GW_BINARY}"
rm "${TEMP_GW_README}"
rm "${TEMP_GW_HELP}"
