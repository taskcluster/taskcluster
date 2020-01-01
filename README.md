<h1 align="center">
  <br>
  <img src="https://media.taskcluster.net/logo/logo.png" alt="Taskcluster" width="80">
  <br>
  Taskcluster
  <br>
</h1>

<p align="center">
  <img alt="Inspecting a task on Taskcluster UI" src="view-task-flow.gif" width="480px">
</p>

<h5 align="center">The task execution framework that supports Mozilla's continuous integration and release processes.</h5>

<p align="center">
  <a href="http://mozilla.org/MPL/2.0">
    <img src="https://img.shields.io/badge/license-MPL%202.0-orange.svg" alt="License">
  </a>
  <a href="https://www.irccloud.com/invite?channel=%23taskcluster&amp;hostname=irc.mozilla.org&amp;port=6697&amp;ssl=1" target="_blank">
    <img src="https://img.shields.io/badge/IRC-%23taskcluster-1e72ff.svg?style=flat"  height="20">
  </a>
  <a href="https://codecov.io/gh/taskcluster/taskcluster">
    <img src="https://codecov.io/gh/taskcluster/taskcluster/branch/master/graph/badge.svg" />
  </a>
  <a href="https://app.netlify.com/sites/taskcluster-web/deploys">
    <img src="https://img.shields.io/netlify/6cc2aece-1178-4933-a581-afc0ec5a259e" />
  </a>
</p>

<hr/>

## Usage

This repository is used to develop, build, and release the Taskcluster services.
It is not possible to run a full Taskcluster deployment directly from this repository, although individual services can be run for development purposes.

## Table of Contents

<!-- TOC BEGIN -->
* [Clients](clients#readme)
    * [Taskcluster Client](clients/client#readme)
    * [Taskcluster Client Go](clients/client-go#readme)
    * [Taskcluster Client for Python](clients/client-py#readme)
    * [Taskcluster Shell Client](clients/client-shell#readme)
    * [Taskcluster Client Web](clients/client-web#readme)
* [Development Documentation](dev-docs#readme)
* [Infrastructure](infrastructure#readme)
    * [Docker Images](infrastructure/docker-images#readme)
    * [References](infrastructure/references#readme)
    * [Taskcluster Builder](infrastructure/tooling#readme)
* [Libraries](libraries#readme)
    * [API Library](libraries/api#readme)
    * [App Library](libraries/app#readme)
    * [Azure Library](libraries/azure#readme)
    * [Config Library](libraries/config#readme)
    * [Iterate Library](libraries/iterate#readme)
    * [Loader Library](libraries/loader#readme)
    * [Monitor Library](libraries/monitor#readme)
    * [Pulse Library](libraries/pulse#readme)
    * [References Library](libraries/references#readme)
    * [Scopes Library](libraries/scopes#readme)
    * [Testing Library](libraries/testing#readme)
    * [Validate Library](libraries/validate#readme)
* [Services](services#readme)
    * [Auth Service](services/auth#readme)
    * [Built-In Workers Service](services/built-in-workers#readme)
    * [GitHub Service](services/github#readme)
    * [Hooks Service](services/hooks#readme)
    * [Index Service](services/index#readme)
    * [Notify Service](services/notify#readme)
    * [Purge-Cache Service](services/purge-cache#readme)
    * [Queue Service](services/queue#readme)
    * [Secrets Service](services/secrets#readme)
    * [Web-Server Service](services/web-server#readme)
    * [Worker Manager Service](services/worker-manager#readme)
        * [About the Keys in this  Directory](services/worker-manager/src/providers/aws-keys#readme)
* [Taskcluster UI](ui#readme)
    * [ui/src/components/CopyToClipboardListItem](ui/src/components/CopyToClipboardListItem#readme)
    * [ui/src/components/DateDistance](ui/src/components/DateDistance#readme)
    * [ui/src/components/Search](ui/src/components/Search#readme)
    * [ui/src/components/Snackbar](ui/src/components/Snackbar#readme)
    * [ui/src/components/SpeedDial](ui/src/components/SpeedDial#readme)
    * [ui/src/components/StatusLabel](ui/src/components/StatusLabel#readme)
<!-- TOC END -->

## Team Mentions

Do you need to reach a specific subset of the team? Use the team handles to mention us with GitHub's @mention feature.

| Team Name | Use To... |
| --------- | --------- |
| `@taskcluster/Core` | ping members of the Taskcluster team at Mozilla |
| `@taskcluster/services-reviewers` | ping reviewers for changes to platform services and libraries  |
| `@taskcluster/frontend-reviewers` | ping people who can review changes to frontend (and related) code in the services monorepo |
| `@taskcluster/security-folks` | ping people who do security things |

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://conduit.vc/"><img src="https://avatars3.githubusercontent.com/u/322957?v=4" width="100px;" alt="James Lal"/><br /><sub><b>James Lal</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=lightsofapollo" title="Code">💻</a> <a href="#former-staff-lightsofapollo" title="Former Mozilla employee on Taskcluster team">👋</a></td>
    <td align="center"><a href="https://github.com/selenamarie"><img src="https://avatars0.githubusercontent.com/u/54803?v=4" width="100px;" alt="Selena Deckelmann"/><br /><sub><b>Selena Deckelmann</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=selenamarie" title="Code">💻</a> <a href="#former-staff-selenamarie" title="Former Mozilla employee on Taskcluster team">👋</a></td>
    <td align="center"><a href="http://code.v.igoro.us/"><img src="https://avatars3.githubusercontent.com/u/28673?v=4" width="100px;" alt="Dustin J. Mitchell"/><br /><sub><b>Dustin J. Mitchell</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=djmitche" title="Code">💻</a> <a href="#staff-djmitche" title="Current Mozilla employee on Taskcluster team">🔧</a></td>
    <td align="center"><a href="https://walac.github.io"><img src="https://avatars1.githubusercontent.com/u/611309?v=4" width="100px;" alt="Wander Lairson Costa"/><br /><sub><b>Wander Lairson Costa</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=walac" title="Code">💻</a> <a href="#staff-walac" title="Current Mozilla employee on Taskcluster team">🔧</a></td>
    <td align="center"><a href="https://github.com/gregarndt"><img src="https://avatars0.githubusercontent.com/u/2592630?v=4" width="100px;" alt="Greg Arndt"/><br /><sub><b>Greg Arndt</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=gregarndt" title="Code">💻</a> <a href="#former-staff-gregarndt" title="Former Mozilla employee on Taskcluster team">👋</a></td>
    <td align="center"><a href="http://petemoore.github.io/"><img src="https://avatars0.githubusercontent.com/u/190790?v=4" width="100px;" alt="Pete Moore"/><br /><sub><b>Pete Moore</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=petemoore" title="Code">💻</a> <a href="#staff-petemoore" title="Current Mozilla employee on Taskcluster team">🔧</a></td>
    <td align="center"><a href="http://hassanali.me"><img src="https://avatars0.githubusercontent.com/u/3766511?v=4" width="100px;" alt="Hassan Ali"/><br /><sub><b>Hassan Ali</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=helfi92" title="Code">💻</a> <a href="#staff-helfi92" title="Current Mozilla employee on Taskcluster team">🔧</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://imbstack.com"><img src="https://avatars2.githubusercontent.com/u/127521?v=4" width="100px;" alt="Brian Stack"/><br /><sub><b>Brian Stack</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=imbstack" title="Code">💻</a> <a href="#staff-imbstack" title="Current Mozilla employee on Taskcluster team">🔧</a></td>
    <td align="center"><a href="https://blog.johnford.org"><img src="https://avatars3.githubusercontent.com/u/607353?v=4" width="100px;" alt="John Ford"/><br /><sub><b>John Ford</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=jhford" title="Code">💻</a> <a href="#former-staff-jhford" title="Former Mozilla employee on Taskcluster team">👋</a></td>
    <td align="center"><a href="http://eliperelman.com"><img src="https://avatars0.githubusercontent.com/u/285899?v=4" width="100px;" alt="Eli Perelman"/><br /><sub><b>Eli Perelman</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=eliperelman" title="Code">💻</a> <a href="#former-staff-eliperelman" title="Former Mozilla employee on Taskcluster team">👋</a></td>
    <td align="center"><a href="https://jonasfj.dk/"><img src="https://avatars2.githubusercontent.com/u/149732?v=4" width="100px;" alt="Jonas Finnemann Jensen"/><br /><sub><b>Jonas Finnemann Jensen</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=jonasfj" title="Code">💻</a> <a href="#former-staff-jonasfj" title="Former Mozilla employee on Taskcluster team">👋</a></td>
    <td align="center"><a href="https://medium.com/@bugzeeeeee/"><img src="https://avatars1.githubusercontent.com/u/18102552?v=4" width="100px;" alt="owlishDeveloper"/><br /><sub><b>owlishDeveloper</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=owlishDeveloper" title="Code">💻</a> <a href="#staff-owlishDeveloper" title="Current Mozilla employee on Taskcluster team">🔧</a></td>
    <td align="center"><a href="https://github.com/milescrabill"><img src="https://avatars1.githubusercontent.com/u/4430892?v=4" width="100px;" alt="Miles Crabill"/><br /><sub><b>Miles Crabill</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=milescrabill" title="Code">💻</a> <a href="#staff-milescrabill" title="Current Mozilla employee on Taskcluster team">🔧</a></td>
    <td align="center"><a href="http://coopcoopbware.tumblr.com/"><img src="https://avatars0.githubusercontent.com/u/609786?v=4" width="100px;" alt="Chris Cooper"/><br /><sub><b>Chris Cooper</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=ccooper" title="Code">💻</a> <a href="#staff-ccooper" title="Current Mozilla employee on Taskcluster team">🔧</a></td>
  </tr>
  <tr>
    <td align="center"><a href="http://grenade.github.io"><img src="https://avatars3.githubusercontent.com/u/111819?v=4" width="100px;" alt="Rob Thijssen"/><br /><sub><b>Rob Thijssen</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=grenade" title="Code">💻</a></td>
    <td align="center"><a href="https://twitter.com/_reznord"><img src="https://avatars0.githubusercontent.com/u/3415488?v=4" width="100px;" alt="Anup"/><br /><sub><b>Anup</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=reznord" title="Code">💻</a></td>
    <td align="center"><a href="https://hammad13060.github.io"><img src="https://avatars2.githubusercontent.com/u/12844417?v=4" width="100px;" alt="Hammad Akhtar"/><br /><sub><b>Hammad Akhtar</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=hammad13060" title="Code">💻</a></td>
    <td align="center"><a href="http://ckousik.github.io"><img src="https://avatars2.githubusercontent.com/u/12830755?v=4" width="100px;" alt="Chinmay Kousik"/><br /><sub><b>Chinmay Kousik</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=ckousik" title="Code">💻</a></td>
    <td align="center"><a href="https://acmiyaguchi.me"><img src="https://avatars1.githubusercontent.com/u/3304040?v=4" width="100px;" alt="Anthony Miyaguchi"/><br /><sub><b>Anthony Miyaguchi</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=acmiyaguchi" title="Code">💻</a></td>
    <td align="center"><a href="http://anarute.com"><img src="https://avatars3.githubusercontent.com/u/333447?v=4" width="100px;" alt="Ana Rute Mendes"/><br /><sub><b>Ana Rute Mendes</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=anarute" title="Code">💻</a></td>
    <td align="center"><a href="http://www.andreadelrio.me"><img src="https://avatars2.githubusercontent.com/u/4016496?v=4" width="100px;" alt="Andrea Del Rio"/><br /><sub><b>Andrea Del Rio</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=andreadelrio" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://www.kristelteng.com/"><img src="https://avatars2.githubusercontent.com/u/9313149?v=4" width="100px;" alt="kristelteng"/><br /><sub><b>kristelteng</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=kristelteng" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/elenasolomon"><img src="https://avatars2.githubusercontent.com/u/7040792?v=4" width="100px;" alt="Elena Solomon"/><br /><sub><b>Elena Solomon</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=elenasolomon" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/t0xicCode"><img src="https://avatars3.githubusercontent.com/u/1268885?v=4" width="100px;" alt="Xavier L."/><br /><sub><b>Xavier L.</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=t0xicCode" title="Code">💻</a></td>
    <td align="center"><a href="http://yannlandry.com"><img src="https://avatars2.githubusercontent.com/u/5789748?v=4" width="100px;" alt="Yann Landry"/><br /><sub><b>Yann Landry</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=yannlandry" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/AyubMohamed"><img src="https://avatars2.githubusercontent.com/u/6386566?v=4" width="100px;" alt="Ayub"/><br /><sub><b>Ayub</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=AyubMohamed" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/lteigrob"><img src="https://avatars0.githubusercontent.com/u/19479141?v=4" width="100px;" alt="lteigrob"/><br /><sub><b>lteigrob</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=lteigrob" title="Code">💻</a></td>
    <td align="center"><a href="https://nextcairn.com"><img src="https://avatars3.githubusercontent.com/u/101004?v=4" width="100px;" alt="Bastien Abadie"/><br /><sub><b>Bastien Abadie</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=La0" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://amjad.io"><img src="https://avatars3.githubusercontent.com/u/4323539?v=4" width="100px;" alt="Amjad Mashaal"/><br /><sub><b>Amjad Mashaal</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=TheNavigat" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/tomprince"><img src="https://avatars3.githubusercontent.com/u/283816?v=4" width="100px;" alt="Tom Prince"/><br /><sub><b>Tom Prince</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=tomprince" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/SamanthaYu"><img src="https://avatars2.githubusercontent.com/u/10355013?v=4" width="100px;" alt="Samantha Yu"/><br /><sub><b>Samantha Yu</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=SamanthaYu" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/auni53"><img src="https://avatars0.githubusercontent.com/u/9661111?v=4" width="100px;" alt="Auni Ahsan"/><br /><sub><b>Auni Ahsan</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=auni53" title="Code">💻</a></td>
    <td align="center"><a href="http://alexandrasp.github.io/"><img src="https://avatars0.githubusercontent.com/u/6344218?v=4" width="100px;" alt="alex"/><br /><sub><b>alex</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=alexandrasp" title="Code">💻</a></td>
    <td align="center"><a href="https://alisha17.github.io/"><img src="https://avatars2.githubusercontent.com/u/13520250?v=4" width="100px;" alt="Alisha Aneja"/><br /><sub><b>Alisha Aneja</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=alisha17" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/prachi1210"><img src="https://avatars3.githubusercontent.com/u/14016564?v=4" width="100px;" alt="Prachi Manchanda"/><br /><sub><b>Prachi Manchanda</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=prachi1210" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/srfraser"><img src="https://avatars1.githubusercontent.com/u/5933384?v=4" width="100px;" alt="Simon Fraser"/><br /><sub><b>Simon Fraser</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=srfraser" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/ydidwania"><img src="https://avatars1.githubusercontent.com/u/22861049?v=4" width="100px;" alt="Yashvardhan Didwania"/><br /><sub><b>Yashvardhan Didwania</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=ydidwania" title="Code">💻</a></td>
    <td align="center"><a href="https://cynthiapereira.com"><img src="https://avatars3.githubusercontent.com/u/1923666?v=4" width="100px;" alt="Cynthia Pereira"/><br /><sub><b>Cynthia Pereira</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=cynthiapereira" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/hashi93"><img src="https://avatars2.githubusercontent.com/u/12398942?v=4" width="100px;" alt="Hashini Galappaththi"/><br /><sub><b>Hashini Galappaththi</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=hashi93" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/fiennyangeln"><img src="https://avatars1.githubusercontent.com/u/24544912?v=4" width="100px;" alt="Fienny Angelina"/><br /><sub><b>Fienny Angelina</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=fiennyangeln" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/kanikasaini"><img src="https://avatars2.githubusercontent.com/u/20171105?v=4" width="100px;" alt="Kanika Saini"/><br /><sub><b>Kanika Saini</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=kanikasaini" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/Biboswan"><img src="https://avatars2.githubusercontent.com/u/22202556?v=4" width="100px;" alt="Biboswan Roy"/><br /><sub><b>Biboswan Roy</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=Biboswan" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/sudipt1999"><img src="https://avatars1.githubusercontent.com/u/38929617?v=4" width="100px;" alt="sudipt dabral"/><br /><sub><b>sudipt dabral</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=sudipt1999" title="Code">💻</a></td>
    <td align="center"><a href="https://www.linkedin.com/in/ojaswin-mujoo/"><img src="https://avatars1.githubusercontent.com/u/35898543?v=4" width="100px;" alt="Ojaswin"/><br /><sub><b>Ojaswin</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=OjaswinM" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/mrrrgn"><img src="https://avatars0.githubusercontent.com/u/42988373?v=4" width="100px;" alt="Матрешка"/><br /><sub><b>Матрешка</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=mrrrgn" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/iFlameing"><img src="https://avatars3.githubusercontent.com/u/33936987?v=4" width="100px;" alt="Alok Kumar"/><br /><sub><b>Alok Kumar</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=iFlameing" title="Code">💻</a></td>
    <td align="center"><a href="https://arshadkazmi42.github.io/"><img src="https://avatars3.githubusercontent.com/u/4654382?v=4" width="100px;" alt="Arshad Kazmi"/><br /><sub><b>Arshad Kazmi</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=arshadkazmi42" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/projectyang"><img src="https://avatars3.githubusercontent.com/u/13473834?v=4" width="100px;" alt="Jason Yang"/><br /><sub><b>Jason Yang</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=projectyang" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/shubhamgupta2956"><img src="https://avatars1.githubusercontent.com/u/43504292?v=4" width="100px;" alt="Shubham Gupta"/><br /><sub><b>Shubham Gupta</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=shubhamgupta2956" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/arku"><img src="https://avatars2.githubusercontent.com/u/7039523?v=4" width="100px;" alt="Arun Kumar Mohan"/><br /><sub><b>Arun Kumar Mohan</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=arku" title="Code">💻</a></td>
    <td align="center"><a href="https://www.polibyte.com"><img src="https://avatars3.githubusercontent.com/u/677595?v=4" width="100px;" alt="Brian Pitts"/><br /><sub><b>Brian Pitts</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=sciurus" title="Code">💻</a></td>
    <td align="center"><a href="http://edunham.net/"><img src="https://avatars2.githubusercontent.com/u/812892?v=4" width="100px;" alt="E. Dunham"/><br /><sub><b>E. Dunham</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=edunham" title="Code">💻</a></td>
    <td align="center"><a href="https://www.linkedin.com/in/shubham-chinda-a0754713b/"><img src="https://avatars2.githubusercontent.com/u/21038543?v=4" width="100px;" alt="Shubham Chinda"/><br /><sub><b>Shubham Chinda</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=Shubhamchinda" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/patrickkang"><img src="https://avatars1.githubusercontent.com/u/1489148?v=4" width="100px;" alt="Patrick Kang"/><br /><sub><b>Patrick Kang</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=patrickkang" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/rbrishabh"><img src="https://avatars3.githubusercontent.com/u/22501334?v=4" width="100px;" alt="Rishabh Budhiraja "/><br /><sub><b>Rishabh Budhiraja </b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=rbrishabh" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/ededals"><img src="https://avatars3.githubusercontent.com/u/43218607?v=4" width="100px;" alt="ededals"/><br /><sub><b>ededals</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=ededals" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="http://ajinkabeer.github.io"><img src="https://avatars1.githubusercontent.com/u/30138596?v=4" width="100px;" alt="Ajin Kabeer"/><br /><sub><b>Ajin Kabeer</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=ajinkabeer" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/katherine95"><img src="https://avatars1.githubusercontent.com/u/17095461?v=4" width="100px;" alt="Catherine Chepkurui"/><br /><sub><b>Catherine Chepkurui</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=katherine95" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/Jo-IE"><img src="https://avatars3.githubusercontent.com/u/51405444?v=4" width="100px;" alt="Jo"/><br /><sub><b>Jo</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=Jo-IE" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/vishakhanihore"><img src="https://avatars1.githubusercontent.com/u/54327666?v=4" width="100px;" alt="vishakha"/><br /><sub><b>vishakha</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=vishakhanihore" title="Code">💻</a> <a href="https://github.com/taskcluster/taskcluster/commits?author=vishakhanihore" title="Documentation">📖</a></td>
    <td align="center"><a href="https://devnoorfatima.github.io/"><img src="https://avatars0.githubusercontent.com/u/44938970?v=4" width="100px;" alt="Noor Fatima"/><br /><sub><b>Noor Fatima</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=devnoorfatima" title="Code">💻</a></td>
    <td align="center"><a href="http://mkneumann777.github.io/personal-portfolio"><img src="https://avatars1.githubusercontent.com/u/52546347?v=4" width="100px;" alt="Michael"/><br /><sub><b>Michael</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=mkneumann777" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/marianazangrossi"><img src="https://avatars1.githubusercontent.com/u/34922478?v=4" width="100px;" alt="Mariana Zangrossi"/><br /><sub><b>Mariana Zangrossi</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=marianazangrossi" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/ANURADHAJHA99"><img src="https://avatars2.githubusercontent.com/u/34815869?v=4" width="100px;" alt="ANURADHAJHA99"/><br /><sub><b>ANURADHAJHA99</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=ANURADHAJHA99" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/Rolikasi"><img src="https://avatars3.githubusercontent.com/u/44370635?v=4" width="100px;" alt="Edil"/><br /><sub><b>Edil</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=Rolikasi" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/olympiawoj"><img src="https://avatars0.githubusercontent.com/u/41010759?v=4" width="100px;" alt="Olympia"/><br /><sub><b>Olympia</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=olympiawoj" title="Code">💻</a> <a href="https://github.com/taskcluster/taskcluster/commits?author=olympiawoj" title="Documentation">📖</a></td>
    <td align="center"><a href="https://theozmic.dev"><img src="https://avatars0.githubusercontent.com/u/15184445?v=4" width="100px;" alt="Michael Ozoemena"/><br /><sub><b>Michael Ozoemena</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=THEozmic" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/lailahgrant"><img src="https://avatars0.githubusercontent.com/u/28113644?v=4" width="100px;" alt="lailahgrant"/><br /><sub><b>lailahgrant</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=lailahgrant" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/km-js"><img src="https://avatars2.githubusercontent.com/u/39799586?v=4" width="100px;" alt="km-js"/><br /><sub><b>km-js</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=km-js" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/clrmachado"><img src="https://avatars0.githubusercontent.com/u/25582189?v=4" width="100px;" alt="Carolina Machado"/><br /><sub><b>Carolina Machado</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=clrmachado" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/susanreenesaa"><img src="https://avatars3.githubusercontent.com/u/49034794?v=4" width="100px;" alt="reenesa"/><br /><sub><b>reenesa</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=susanreenesaa" title="Code">💻</a></td>
    <td align="center"><a href="https://www.kelliblalock.com"><img src="https://avatars0.githubusercontent.com/u/2024584?v=4" width="100px;" alt="Kelli Blalock"/><br /><sub><b>Kelli Blalock</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=kellim" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/naimiii"><img src="https://avatars1.githubusercontent.com/u/28563415?v=4" width="100px;" alt="naima shaikh"/><br /><sub><b>naima shaikh</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=naimiii" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/JiwoonKim"><img src="https://avatars2.githubusercontent.com/u/29671309?v=4" width="100px;" alt="Jiwoon Kim"/><br /><sub><b>Jiwoon Kim</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=JiwoonKim" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/sccofield"><img src="https://avatars0.githubusercontent.com/u/12601490?v=4" width="100px;" alt="Michael Umanah"/><br /><sub><b>Michael Umanah</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=sccofield" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/FahdJamy"><img src="https://avatars1.githubusercontent.com/u/27225249?v=4" width="100px;" alt="Fahd Jamal A."/><br /><sub><b>Fahd Jamal A.</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=FahdJamy" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/shilpiverma509"><img src="https://avatars2.githubusercontent.com/u/19169876?v=4" width="100px;" alt="shilpi verma"/><br /><sub><b>shilpi verma</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=shilpiverma509" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/somchi"><img src="https://avatars0.githubusercontent.com/u/28669926?v=4" width="100px;" alt="somchi"/><br /><sub><b>somchi</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=somchi" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/Henikilan"><img src="https://avatars2.githubusercontent.com/u/52250201?v=4" width="100px;" alt="Anastasia"/><br /><sub><b>Anastasia</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=Henikilan" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/bini11"><img src="https://avatars0.githubusercontent.com/u/34271745?v=4" width="100px;" alt="Lubna"/><br /><sub><b>Lubna</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=bini11" title="Code">💻</a></td>
    <td align="center"><a href="https://soundharyaam.com/"><img src="https://avatars2.githubusercontent.com/u/24657693?v=4" width="100px;" alt="Soundharya AM"/><br /><sub><b>Soundharya AM</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=Soundharyaam" title="Code">💻</a></td>
    <td align="center"><a href="https://moosej.github.io/"><img src="https://avatars3.githubusercontent.com/u/15016463?v=4" width="100px;" alt="Mustafa Jebara"/><br /><sub><b>Mustafa Jebara</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=MooseJ" title="Code">💻</a></td>
  </tr>
</table>

<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind are welcome!
