import fs from 'fs'

const path = './data/606473545249325066/commandData.json'

const cmdData = JSON.parse(fs.readFileSync(path, 'utf8'))

const res: any = { commands: {} }

for (const key in cmdData.commands) {
  const lowKey = key.toLowerCase()
  const cmd = cmdData.commands[key]
  res.commands[lowKey] = cmd

  const resCmd = res.commands[lowKey]

  if (resCmd.alias) {
    for (const alias of resCmd.alias) {
      res.commands[alias] = { clone: lowKey }
    }
  }
  resCmd.alias = undefined
}

fs.writeFileSync(path, JSON.stringify(res, null, 2))
console.log('Fin')
